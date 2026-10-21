# Chora Studio — DAW / Groovebox Parity Assessment (2026-10-21)

Read-only audit of the Beats studio (Timeline, MEKA, Glass) plus notation, voice-to-MIDI and the
generative council. Goal: **functional** parity with Bitwig + Studio One (Timeline), Maschine 3 + MPC 3
(MEKA) and FL Studio's Channel Rack (Glass) — in Chora's own UI language, not theirs.

Abbreviations: TV = `components/melos/beats/timeline/TimelineView.tsx`, PR = `timeline/PianoRoll.tsx`,
EP = `timeline/TimelineEditPanel.tsx`, GD = `services/melos/beats/grooveDoc.ts`,
SCH = `services/melos/beats/engine/scheduler.ts`, BE = `engine/BeatsEngine.ts`, UBD = `components/melos/beats/useBeatsDoc.ts`.

---

## Phase 1 status (2026-10-21)

Done:
- **Undo transactions**: every mutation made while the pointer is held (drag, trim, knob turn, paint stroke) is one undo step (`useBeatsDoc`).
- **Tempo track + meter map** (`services/melos/beats/tempoMap.ts`):
  - Supports tempo steps and linear ramps, plus time-signature changes per bar.
  - Driven by the scheduler, live engine, offline bounce, metronome (accents per bar, clicks per meter count), count-in and launcher bar quantum.
  - Timeline tempo lane (`TempoLane.tsx`) and ruler right-click for meter changes.
  - Transport bar has a time-signature chip, and the position readout counts in the meter.
- **Project key** `doc.key` (`songKey.ts`): set from the transport-bar key chip. Piano-roll in-key row shading. Hum snaps into the project key, and adopts the detected key when none is set. Region generation uses it instead of "D Minor".
- **Snap grid** (`snapGrid.ts`): Adaptive/Fixed/Off modes, bar…1/64 divisions, triplets, Shift/Alt bypass.
  - Anchored to bar lines, so odd meters work.
  - Used by timeline clip move/trim/knife/loop/ruler and by the piano roll.
  - The meter-aware grid overlay replaces the per-lane 4/4 gradients.
- **Bugs fixed**:
  - The audio editor Split now really splits the clip, and audio offsets go through the tempo map + stretch (`clipEdit.ts`).
  - The Glass graph editor pages beyond step 16.
  - Muted instrument pads are silent live and in the bounce.
  - The loop seam is sample-accurate: the wrap is re-anchored at the exact loop-end time, and audio clips are cut at the seam.
- Tests: `npm run test:melostime` (10 tests). Dev page: `/chora-studio-lab.html` on the normal dev server.

Deferred:
- Per-note MPE is still missing from the bounce, and live MPE curves are still `setTimeout`-driven. Both need scheduled expression events in `rust/plajah-audio` (a `pa_schedule_expression`) plus a wasm rebuild.
- Hum tempo drift belongs to the phase 6 capture rebuild (count-in + click-locked takes).
- `.dawproject` export still writes one tempo and 4/4.
- Docked NoteTab vs PianoRoll duplication is a product decision.

## Phase 7 status (2026-10-21)

Done (the composer council, entirely on the user's machine — no cloud model, no account):
- **Council · Notation** is the new default mode of the timeline region bar. "Compose with the council" opens `components/melos/beats/council/CouncilComposerPanel.tsx` for the loop region. In the panel you:
  - describe how the passage should feel;
  - pick new parts by role and/or tick existing instrument tracks to rewrite;
  - edit the song's lyrics (`doc.lyrics`, `LyricLine { id, bar, text }`, 0-based bars): paste lines and place them every N bars, or edit each line's bar, with syllable estimates;
  - choose the **melody writer**.
- **Context packet** (`composeContext.ts`, pure). For the region ±2 bars it gathers:
  - every bar's meter and section;
  - the chord the other tracks imply, as a name plus `chordPcs` (root first); if nothing else plays, from the tracks being rewritten;
  - the lyric line on each bar;
  - every track's notes, drum grids and where each track plays across the song;
  - the key (`keyPc`/`scaleId`, C major when unset) and the tempo.
- **Rules arranger** (`rulesArranger.ts`):
  - `readMood` turns the description into energy, brightness and lift.
  - `regionChords` reads the bar chords, or realises a progression in the key when the region is silent (minor-mode progressions rooted correctly).
  - It writes bass (roots/fifths/octave pulse by energy), voice-led harmony (`voiceChord` picks the inversion with the least movement), held pads, arps and a fill.
  - It also has fallback writers: a melody (one note per syllable, arch contour, chord tones on strong beats, a lift on the last phrase) and a guide-tone counter-melody kept mid-register.
  - Every part gets phrase dynamics.
- **Melody writers** (`localCouncil.ts`, `writerLanes()` detects what this machine has; priority `desktop → studio → device → rules`, best available auto-selected):
  - `desktop` — **the Plajah desktop app's native engine** (`windows-native/Plajah.WinUI/NativeLlmService.cs`).
    - llama.cpp via LLamaSharp 0.30 on the PC's GPU through **Vulkan** (NVIDIA / AMD / Intel; no CUDA bundle, to keep the MSIX small).
    - GGUF models from `%LOCALAPPDATA%\Plajah\Models\llm`, `D:\Plajah Models\llm` or `PLAJAH_LLM_DIR`. Ladder: Gemma 4 (if its GGUF is present) → Qwen2.5-7B → Nemotron 4B → Gemma 2 2B. In-app download is resumable.
    - One resident model with **one resident context**, cleared per request (the per-request context had cost ~6 s), unloaded after 4 idle minutes.
    - Bridge messages: `LOCAL_LLM_REQUEST` (requestId, messages, model, maxTokens, temperature), `LOCAL_LLM_CANCEL`, `LOCAL_LLM_STATUS`, `LOCAL_LLM_DOWNLOAD` (+ progress). Web side: `nativeLlmChat` / `getNativeLlmStatus` / `downloadNativeLlmModel` in `services/windowsBridgeService.ts`.
    - This replaced a stub that returned an empty string. Aria now uses it too, falling back to her browser model when no GGUF is installed.
  - `device` — an on-device model in **its own Web Worker** (`councilModel.ts` + `councilModel.worker.ts`). A worker gets a fresh wasm heap, keeps generation off the audio thread, and `release()` (on panel close, cancel or timeout) terminates it so every byte returns.
    - Engine ladder, stepping down on any load failure (each failure is remembered for 24 h): Gemma 4 E2B q4f16 (when chosen in Aria's settings, WebGPU) → Qwen 2.5 1.5B q4 (WebGPU, ≈1.8 GB) → Qwen 2.5 0.5B q4 (≈0.8 GB).
    - The panel shows download/load progress.
    - The model writes the compact note-line format (`noteLines.ts`: `bar beat length pitch`); the parser tolerates prose and code fences. There is one firmer retry, a token budget sized to the part, a 2-minute time limit, and the rules fill any phrase the model leaves empty (credited).
  - `studio` — the studio's local score models through the music lab (admin, backend connected): YuE2 sets a sung melody from the lyrics; Qwen (`qwen-score`, Qwen3 8B via Ollama or GGUF) writes the other lines.
  - `rules` — instant fallback.
  - A failed or empty model answer falls back to the rules for that part, and the take's credits say who wrote what.
- **Critic** (`councilRepair.ts` + `critiqueComposition`): it repairs instead of asking for a revision:
  - folds notes into range (a sung range when there are lyrics);
  - pulls out-of-key notes in, except weak-beat stepwise passing tones;
  - moves strong-beat minor-second rubs onto chord tones;
  - fits each lyric line to about one note per syllable (splits long notes, adds a line when it's missing, thins one too busy to sing);
  - moves doubled notes onto pitches the other track isn't playing;
  - shapes flat dynamics.
  The take lists what was fixed and what is still worth a look.
- **Takes** A, B, C… show the brief (key, tempo, mood, chord names), credits, parts, the lyric reading and the critic. Applying one is a single undo step. A rewrite onto a busy track goes to a take track under it. Clips are tagged `local-council:<lane>`.
- Tests: `tests/melosCouncil.test.ts` (in `npm run test:melostime`).

Not done / limits:
- **Desktop engine, measured with a console harness that compiles `NativeLlmService.cs`**:
  - It picked the RTX 4070 Laptop GPU by itself and offloaded all layers.
  - The Vulkan build needs the CPU package's `ggml-cpu.dll`; the loader supplies it.
  - On the warm context a 1-token reply takes 0.14 s.
  - Qwen 2.5 7B follows the note-line format. Gemma 2 2B doesn't (bare note names), so it is last in the ladder.
  - Throughput on this laptop was low (≈2–9 tok/s) because the GPU was thermally throttled: 83–85 °C idle with a GPU sidecar holding a context, clocks at 210 MHz under load. That's the machine's state, not the engine.
  - Not yet run inside the WinUI window itself (the bridge contract is covered by the build).
- **In-browser, measured on the dev laptop (the browser used the Intel Xe-LPG iGPU, not the RTX)**:
  - Qwen 1.5B failed with `std::bad_alloc` at session create, both in the studio tab and in its own worker; its 1.8 GB weights plus the session don't fit the 4 GB wasm address space.
  - Qwen 0.5B loads (≈1.5 min first time) and writes, but slowly: about 2.5 minutes per attempt with the window minimised.
  - It also writes weakly: line 1 was a few repeated notes, line 2 empty. The repair pass plus the rules make the take usable, but **0.5B is not a melodist**.
  - Gemma 4 (≈2 GB, q4f16) was not tested; it will likely hit the same heap limit here, and fp16 risks garbage on Intel iGPUs.
- The `.NET 8` build of LLamaSharp has no backend-selection API, so `NativeLlmService.ConfigureBackend` preloads the native DLLs itself (Vulkan → AVX2 → AVX → none).
- The csproj now defaults a RuntimeIdentifier; without one, LLamaSharp copies every OS's runtimes and the PRI resource indexer fails.
- The studio lane only works where the music lab backend is connected (admin).
- No "regenerate bars 3–4 of a take" yet. Lyrics aren't imported from the Project view yet. Drums are context only.

## Phase 6 status (2026-10-21)

Done (voice — the mic as an instrument):
- **Voice panel** (mic button in the transport bar → `components/melos/beats/voice/VoicePanel.tsx`), with Sing / hum and Beatbox modes, a level meter and a sensitivity control.
- **Pitch → notes** (`services/melos/beats/voice/pitchTrack.ts`): YIN on 10 ms hops of 40 ms windows and a streaming `NoteSegmenter`. Onsets are back-dated to the first confirming frame. Legato re-articulates only when a new pitch holds; vibrato, scoops and single-frame octave slips do not spray notes.
- **Click-locked capture** (`voiceCapture.ts`): an AnalyserNode on the engine's own AudioContext, so every event is on the transport clock (input latency + half a window subtracted) and is converted with `engine.beatAt()`. Raw mic: no echo cancel, no noise suppression, no AGC. With record armed and the transport running (the existing count-in and metronome), finished notes go through `commitRecordedNote` into the armed track. Writes are clip- and meter-aware, and a whole take is one undo step (`coalesce`).
- **Sing the synth:** live note on/off drives the armed instrument. "Glide" maps the voice's fractional pitch to pitch bend (±2 semitones). "Snap to key" uses `docKey`.
- **Beatbox → MEKA** (`beatbox.ts`): a 10 ms level onset detector, then a 40 ms spectral fingerprint (centroid, low/high share, zcr, flatness). Built-in rules handle kick, snare and hat. **Teach it your mouth** takes 5 examples per class into a z-scored nearest-template model (level ignored), stored in localStorage. Hits call `engine.performPadHit` (plays now, `onPadHit` with the exact onset time), so the phase-3 pad recorder records them. The class → pad map defaults by pad name/voice.
- Tests: `tests/melosVoice.test.ts` (in `npm run test:melostime`).
- Browser-verified in the lab with synthetic sources: a sung C-E-G-C phrase recorded as 60/64/67/72, each 1 beat long, within 0.02 beats of the sung onsets, and undone in one step. Alternating kick/hat bursts classified 8/8. Teach captured 5 examples, persisted them and switched to the taught model.

Not done / limits:
- Not yet tested with a real microphone and a human voice (the sensitivity defaults may want tuning). There is no AudioWorklet: the analysis is a 10 ms main-thread timer, so a busy UI thread can delay (but not mis-time) events.
- Monophonic only. No pitch-bend recording into the clip (glide is live only). Beatbox has 4 classes.

## Phase 5 status (2026-10-21)

Done (notation as a native lens):
- **Score model** (`notation/scoreModel.ts`):
  - Bars come from the song meter, including compound meters, which group in dotted quarters.
  - Each beat, per staff, is quantized to a straight 16th or 8th-triplet grid.
  - Same-onset notes become chords; rests fill the gaps; values are dotted where they fit; notes split and tie at bar lines and off-beat beat boundaries.
  - Pitches are spelled from `doc.key` (modes use their relative major's signature); accidentals carry through the bar and are cancelled with naturals.
  - Automatic treble, bass or grand staff, split at middle C.
- **Score lens** (`ScoreView.tsx`) in the piano roll: **Roll | Score | Split | Steps**.
  - Proportional, beat-aligned spacing, so Split lines up with the roll.
  - Engraving: sticky clef and key-signature gutter, beams per beat (with 16th beams), flags, ties, triplet brackets, ledger lines, rests, dots, accidentals, the playhead and the clip window's dimming.
- **Score editing**:
  - Click/Shift/Ctrl to select; drag to move in time (grid) and pitch (staff steps, in key).
  - Double-click the staff to add (Shift = ♯, Alt = ♭).
  - Note values 3–7 plus `.` dot, and a triplet toggle; changing the value retimes the selected notes.
  - **N** for note input: A–G at the caret (octave nearest the last note), 0 = rest, click to move the caret.
  - The roll's keys still apply: transpose, nudge, clipboard, quantize, Delete.
- **MusicXML** (`notation/musicXml.ts`):
  - Export from the roll (one clip), File → Export score (every instrument track as a part) and the clip menu. It covers divisions, key, time, clefs, grand staff with `<backup>`, ties, tuplets, accidentals and tempo.
  - Import via File → Import score (`.musicxml`/`.xml`/`.mxl`): parts become instrument tracks. An empty song adopts the score's tempo and meter, and the key is adopted when unset. Handles chords, voices (`<backup>`/`<forward>`), merged ties and pickup bars.
  - A built-in XML parser keeps it dependency-free.
- Tests: `tests/melosNotation.test.ts`, including an export→import round-trip and `.mxl` (41 total via `npm run test:melostime`).

Not done:
- One voice per staff: polyphony within a staff is shown as chords truncated at the next onset.
- No articulation, dynamics or lyric engraving.
- No 32nds or quintuplets.
- Clef glyphs use the system font (Segoe UI Symbol / Noto Music).
- No PDF/print engraving: Verovio from our MusicXML is the follow-up for publication-quality output.

## Phase 4 status (2026-10-21)

Done (Glass ≈ FL Studio's channel rack):
- **Channel ops** (`channelOps.ts`, row right-click): Clone, Clone with steps, Delete channel, Move up/down.
  - Every pattern's steps and pitch-roll notes move with the pad, along with clip loop lengths and the backing instrument track (an instrument pad's clone gets its own track).
  - A clone lands in the Group's first empty pad, or a new Group when it's full.
- **In-rack volume and pan knobs plus Solo.** Solo silences the other channels in the sequence, live and in the bounce.
- **Graph lanes**: velocity, pitch, fine (cents), pan, cutoff + resonance (a low-pass on that hit only), tail (×¼…×4 decay/release) and shift (micro-timing).
  - Drag across the bars to paint; reset a lane per channel.
  - Played by the engine and printed in the bounce.
- **Step tools**: fill each 2/4/8, rotate left/right, invert, randomize.
- **Per-channel swing**: follow the song or 0–75%.
- **Send to piano roll**: the row's steps become MEKA pitch-roll notes and MEKA opens on that pad.
- **Step record**: a cursor walks the selected channel; a pad hit writes that pad, QWERTY z…m writes pitched steps on the selected channel, ← → move, Backspace clears and steps back. Works while stopped; armed live recording covers playback.
- Tests: `tests/melosGlass.test.ts` (32 total via `npm run test:melostime`).

Not done:
- Pattern length beyond 16/32/48/64.
- Ghost channels and channel filter groups.
- Audio-clip channels in the rack.
- Release velocity as its own lane (the tail lane covers note length).

## Phase 3 status (2026-10-21)

Done:
- **Group-scoped patterns** (`Pattern.groupIdx`; untagged legacy patterns count as Group A, so old songs are unchanged).
  - The pattern bar shows the current Group's patterns (it follows the selected pad).
  - New patterns are named per Group (A1, B1…), and a new Group gets its first pattern automatically.
  - Glass's channel rack shows only the pattern's Group pads.
- **Pattern mode plays every Group at once** (Maschine "Ideas"). The scheduler plays a set of patterns; picking a pattern while playing swaps only its Group at the next bar. The clip launcher shows every live slot.
- **Scenes + Song** (`songSections.ts`, MEKA `ScenesBar`):
  - Scenes capture each Group's pattern and launch together at the bar.
  - Song sections (scene × bars, sized by the meter) build one managed track per Group on the Timeline, with one clip per section. The default Grooves track is adopted as Group A; hand-made clips on managed tracks are kept.
  - The Timeline arranger lane (`ArrangerLane.tsx`) drags sections to reorder the song and changes their scene or length.
- **Live pad recording** (`padRecord.ts`):
  - Armed record + running transport writes hits into the playing pattern of the pad's Group. In song mode it writes the pattern clip under the playhead, slip-aware.
  - Rec Q snaps to the 16th; off keeps micro-timing. Hits are latency-compensated and each pass is one undo step.
  - Every input path is covered (pads, QWERTY, MIDI, note repeat).
- **Note repeat in the engine**:
  - Scheduled on the audio clock, locked to the transport (or a free clock at the song tempo when stopped).
  - Rates 1/4–1/32 including triplets, plus swing.
  - Pads, QWERTY and MIDI pads all use it, and repeats are recorded on the grid.
- Tests: `tests/melosSong.test.ts` (27 total via `npm run test:melostime`).

Not done:
- The NI controller (HID) path still fires plain hits (no note repeat; it reports no pad releases).
- No 16 Levels, keyboard or chord pad modes yet.
- Scenes can't be reordered in MEKA (the song sections can).

## Phase 2 status (2026-10-21)

Done:
- **Clips are windows onto their content** (`clipContent.ts`):
  - `contentOffsetBeats` (slip / left trim) plus an optional content `loop`, and `audio.loop` for audio.
  - The scheduler, bounce, timeline drawing, recording, piano roll, CC lanes, MIDI and .dawproject export all read clips through it.
  - Split is non-destructive. Glue and Consolidate bake the window into plain notes.
- **Timeline clip gestures**:
  - Drag the left or right edge to trim.
  - Alt-drag slips the content; Ctrl/⌘-drag copies; Shift bypasses snap.
  - Loop content from the clip menu, then drag the right edge to repeat it.
  - Keys: Ctrl+C/X/V (paste at the playhead onto the selected track, keeping track offsets), Ctrl+D, Ctrl+A, ←/→ nudge by a grid cell (Shift = a bar).
- **Piano roll**:
  - Marquee and Shift/Ctrl multi-select; move and resize every selected note at once.
  - Ctrl+C/X/V/D/A, Delete, ↑/↓ transpose (Shift = octave), ←/→ nudge, Q quantize.
  - Quantize menu with strength, swing and ends; transpose buttons.
  - Scale lock and Fit to scale (project key).
  - Loop brace and slip handle on a strip above the grid; content outside the window is dimmed; velocity and MPE lanes paint the whole selection.
- **CC lanes** in the roll drawer: mod wheel (CC1), expression (CC11), sustain (CC64), pitch bend. Sustain extends note-offs live and in the bounce; expression is a sample-accurate strip gain.
- **Track automation** (`automation.ts`, `engine/automationPlayer.ts`, `TrackAutomation.tsx`):
  - Lanes for volume, pan, send 1/2, instrument macros 1–8 and the MIDI CCs, with five curve shapes (linear, smooth, ease-in, ease-out, hold).
  - AudioParam targets are scheduled ahead, sample-accurate, live and in the bounce. Instrument-message targets are sent per tick live; the bounce suspends the offline context at each change.
  - Read/Touch/Latch/Write recording from mixer moves (`useAutomationRecorder`), one undo step per pass.
- **MIDI export** (`midiExport.ts`): project (File → Export MIDI), track and clip (timeline menus). Includes:
  - SMF type 1 at 480 PPQ.
  - A conductor track with the tempo map, meters and key.
  - Played notes with slip and loop baked in.
  - CC and pitch-bend lanes.
  - MEKA patterns as a GM drum track on channel 10.
- **Bugs fixed**: instrument-track fader and pan did nothing (the graph only applied audio tracks); instrument-track inserts and sends were missing from the bounce.
- Tests: `npm run test:melostime` (21 tests, including a MIDI export → import round-trip).

Not done / caveats:
- Mixer faders show the static value, not the automated one, while a lane plays.
- Alt-slip and Ctrl-copy drags are unit-tested at the edit level but were not browser-driven (the test harness can't hold modifiers during a drag).
- MEKA pad pitch-roll notes aren't in the MIDI drum export.
- `.dawproject` export doesn't carry automation yet.

## 0. Bugs to fix first (found during the audit, verified)

| Bug | Where | Effect |
|---|---|---|
| Every pointermove during a drag calls `mutate` → full doc clone pushed to undo | TV:1440, PR:423, TV:912 → UBD:84-95 | One drag can wipe the 100-step history; deep clone per mouse move (jank) |
| Audio editor "Split" keeps only the left half | EP:213 `edit.split(b, at)[0]` | Split behaves as crop |
| Glass graph editor renders `min(length,16)` columns | glass/StepGraphEditor.tsx:49 | Steps 17–64 uneditable |
| Offline render ignores per-note MPE/expressions | render.ts (no `evaluateNoteMpe`) | Bounce ≠ what you heard |
| Live MPE curves driven by `setTimeout` | BE:932-937 | Jittery expression |
| Loop wrap via `seekTo` at tick time | BE:1092-1103 | Loop seam not sample-accurate |
| Hum import drops `meta` (key/bpm), times notes vs hum-detected bpm | TV:949, TV:439-447 | Hummed parts drift off grid |
| Instrument pads likely ignore pad mute (unverified at runtime) | `triggerPadInstrument` | Muted pads may still sound |
| Docked NoteTab duplicates PianoRoll with conflicting gestures | EP:93-136 | Two editors, click = delete in one |

---

## 1. Timeline (Bitwig × Studio One)

**Present:** pattern/MIDI/audio tracks, clip move (multi-select), split/glue tools, rubber-band select,
loop region, count-in + metronome, MIDI record to armed track (overdub), insert FX chains, 2 sends,
MIDI learn, Firestore autosave + `.melos`, `.dawproject` import/export (partial), stereo render,
waveform peaks, offline normalize/reverse/fade/crop, offline WSOLA/phase-vocoder stretch.

**Gaps, ranked (what a Bitwig/S1 user hits first):**
1. **Snap/grid system** — moves hard-locked to 1 bar, trims to 1 beat (TV:1445, 1453). Need grid menu
   (adaptive/1-1/64, triplet, off), Alt bypass, snap to events/markers.
2. **Undo transactions** — begin/commit gesture API instead of per-move snapshots (see bug 1).
3. **Automation** — `automationLanes` typed (GD:183-201) but never drawn, read by engine, or rendered.
   Need lanes per param, breakpoints + curve tension, read/write/touch/latch, clip automation.
4. **Audio recording** — none. Input selection, input monitoring, latency compensation (BE ignores
   `outputLatency`), loop recording into **take lanes + comping** (S1 / Bitwig comp).
5. **Clip editing core** — left-edge trim, slip edit (`offsetSec` exists), loop-extend for MIDI/audio
   clips (SCH:254 truncates), Alt/Ctrl-drag copy, Ctrl+D, paste-at-playhead, multi-track paste, cut.
6. **Piano roll** — single-note selection only (PR:74). Need marquee + multi-select, tools
   (draw/erase/slice/mute/velocity paint), copy/paste/duplicate, quantize (strength/swing/ends),
   transpose, scale/key snap + highlighting, chord tool, ghost notes from other tracks, CC / pitch-bend /
   aftertouch lanes, MIDI export.
7. **Arranger track** — Studio One's signature. Markers are display-only (TV:1196). Need editable
   sections that move/copy/reorder all tracks underneath (this is also the MEKA Song target, §2).
8. **Tempo + time-signature track** — single `bpm`, 4/4 hard-coded (TV:38, SCH:10).
9. **Elastic audio** — warp markers, transient detection, tempo-following stretch (today `stretch` =
   `playbackRate`, pitch moves).
10. **Clip fades/crossfades handles + clip gain UI** (`gainDb` exists, no UI).
11. **Clip launcher** — single pattern column. Need per-track slot grid, scenes, launch quantize options,
    follow actions, record into slots, record launcher performance to arrangement.
12. **Routing** — group/bus/FX-return tracks, folders that sum, N sends with pre/post, sidechain, PDC.
13. Freeze / bounce-in-place / consolidate / render selection / **stem export**.
14. Track reorder (drag headers), track colour UI, full shortcut map (zoom, nudge, Ctrl+A/X/D, markers).
15. VST/CLAP hosting (built-in devices only; desktop/Tauri path only).

---

## 2. MEKA (Maschine 3 × MPC 3)

**Structural root cause:** a `Pattern` covers *every* pad in the kit (GD:93-101). "Groups" are display
banks of 16 (GD:502); bus groups A–D are a separate concept. Nothing is group-scoped, so scenes and
auto-populated arrangement can't exist yet.

**Present:** 16 velocities, step mode, choke groups, per-pad ADSR/filter/tune, instrument (keygroup-ish)
pads via ONDA/KERA, 8 macro knobs + MIDI learn, NKS tag browser with previews, per-step pitch/pan/FX,
engine-side step probability, undo.

**Missing, ranked:**
1. **Group-scoped patterns** (`Pattern.groupId`, per-group length/time-sig).
2. **Scenes + Song/Sections → auto-populated timeline** (design below).
3. **Live pad recording** with record-quantize, overdub/replace — pad hits are never written (BeatsRoom:372).
4. **Sampling** — record from input with threshold, resample internal audio.
5. **Chop/slice** (transient / grid / manual) → slice to pads / to keygroup.
6. **Pad sample editor** — start/end/loop/reverse/normalize/stretch (reuse `audioEdit.ts`, `timeStretch.ts`).
7. **Kit / program save-load-browse** with user tags.
8. **Note repeat** scheduled by the engine (today a `setInterval` UI timer), with rate, swing, arp, latch, recorded.
9. **Parameter locks** beyond pitch/pan (cutoff, decay, sample start, FX params) + per-pad automation.
10. **Pad modes** — 16 Levels (pitch/param), keyboard, chord (scale-aware), fixed velocity.
11. Probability + ratchet **UI** on pad steps, per-group swing/groove.
12. Mute groups, pad solo, Lock snapshots + morph, stems export.

### Maschine-style auto-population — proposed design
- `GrooveDoc.groups: { id, name, color, padRange, busId }[]`; `Pattern.groupId`.
- `Scene { id, name, slots: Record<groupId, patternId | null> }`, `Section { id, sceneId, lengthBars, name }[]`.
- Pure `syncArrangementFromSections(doc)`: one `kind:'pattern'` track per used group (tagged
  `generatedBy:'song'`, `groupId`), one clip per section from the scene slot, looping shorter patterns;
  runs on every section/scene edit; never touches user-made tracks. Sections render as **arranger-track**
  regions (same object as §1 #7 — one concept, two views).
- Scheduler: a group track fires only that group's pads (today `fireRowClip` fires every pad, SCH:149-176).
- "Flatten to MIDI/clips" (MPC convert-to-sequence): breaks the link and writes editable note clips per pad/group.
- Timeline pad lanes nest under their group track instead of one flat list (TV:1229-1295).

---

## 3. Glass (FL Studio Channel Rack)

**Present:** per-channel step rows, mute, pattern select/clone/rename (in BeatsRoom), per-step pitch,
step FX slots (beyond FL), patterns as clips in the Timeline playlist.

**Missing, ranked:**
1. Channel clone / delete / reorder; in-rack volume, pan, solo; pick mixer insert.
2. Graph editor: fix 17+ steps; add release, fine pitch, cutoff, resonance, shift lanes.
3. Arbitrary pattern length (any step count, not just 16/32/48/64), length + pattern picker inside Glass.
4. Fill every 2/4/8, rotate/shift, randomize, invert, clear.
5. **Send channel to Piano Roll** (open full PR on that channel, FL-style notes ↔ steps).
6. Per-channel swing.
7. Step recording from keyboard/MIDI into selected channel.
8. Channel filter groups, ghost channels, layer channels, audio-clip channels.
- `glass/SequenceStrip.tsx` is dead code (not mounted) — wire as Glass's mini-playlist or delete.

---

## 4. Notation (native, switchable from MIDI)

**Exists:** `verovio@6.2` (lazy) via `components/VerovioScore.tsx` (repertoire only);
`services/musicNotation.ts` (`buildNotation`, `notationToMusicXML`, 16th grid, no tuplets);
`components/SheetMusic.tsx` (display-only SVG staff); `.mid` import into the Timeline.

**Gaps:** no score view in PianoRoll; Beats `NoteEvent[]` can't reach `buildNotation` (expects audio
`Transcription`); no MusicXML import/export, no MIDI export, no editable notation, no tuplets.

**Plan:**
- One note model, two lenses: PianoRoll gets a **Roll | Score | Split** toggle editing the same `NoteEvent[]`.
- Adapter `noteEventsToNotation()` → extend `musicNotation.ts` with tuplets, voices, key/time from the
  tempo/signature track, enharmonic spelling from the key.
- Rendering: in-house SVG engraver for live, interactive editing (hit-testing needs our own geometry);
  Verovio for print/PDF/part extraction from our MusicXML.
- Editing: click-to-place by pitch/duration palette, keyboard entry (A–G, 1–7 durations, ↑↓ transpose,
  . dot, T tie), drag notes, articulations/dynamics mapped to velocity/length.
- Full-score view across tracks (instrument transpositions, percussion staff from MEKA pads).
- Import/export MusicXML + `.mid` (generalise MThd writer at `data/classicBookSoundtracks.ts:780`).

---

## 5. Hum / sing / beatbox → MIDI + live mic → synth

**Exists:** HumRecorder → offline YIN (melody + bass bands), self-detected beat grid, Krumhansl key,
scale snap (`humToMidi.ts`, `audioTranscription.ts`); Basic Pitch (tfjs, vendored weights) available but
not used by HumRecorder; drum-loop → steps (`drumTranscription.ts`, kick/snare/hat heuristic).
No beatbox path, no real-time mic path (instrument worklet `numberOfInputs: 0`, InstrumentHost.ts:144).

**Plan:**
- **Capture UX:** count-in + click locked to project tempo/loop region, record into the armed track
  (not a modal), takes stacked as lanes; live note preview while you sing.
- **Melodic engine:** real-time pYIN/YIN in an AudioWorklet (port of `yin()`, later Rust in `plajah-audio`)
  for live display; on stop, a Basic Pitch pass refines onsets/offsets. Note segmentation with
  hysteresis, vibrato-aware pitch centre, octave-error correction, project key/scale snap, quantize
  strength + "keep feel" toggle, sliders for sensitivity/min-note.
- **Beatbox → drums:** onset detector (reuse drumTranscription flux) + per-hit features (spectral centroid,
  band energy, ZCR, decay) → kick/snare/hat/open-hat/clap/perc classes; **"teach it your mouth"** calibration
  (5 hits per sound → nearest-template classifier), maps to MEKA pads with velocity and micro-timing.
- **Live mic → synth ("Sing the synth"):** worklet pitch tracker → `instrumentNoteOn` + continuous
  `pa_set_expression` bend (Rust already takes float notes, lib.rs:114/164), amplitude → velocity/pressure,
  brightness → timbre; modes: Glide (continuous), Snap-to-scale, Trigger (beatbox fires pads). Target
  < 25 ms detect latency; records as MIDI + MPE.

---

## 6. Generative region → notation (Composer/Producer council)

**Exists:** Music Council = mix/master advisor only (Gemini, no notes). Note writers: PromptComposer
(Gemini → notes at playhead), ProgressionBrowser, BreakdownImporter, and region generation
(TV:732-812, loop range) which runs **local Qwen/ACE via Ollama/Python** — conflicts with the
no-local-LLM rule. Region generation sends `lyrics: ''` (TV:751), key falls back to `'D Minor'` (TV:753),
and reads **no other tracks**. Claude proxy exists (`POST /api/ai/anthropic`, server.ts:6303) but caps
`max_tokens` at 4096 and no Melos path uses it.

**Plan:**
- **Select region → describe emotion/feeling → council writes notation** for chosen target tracks
  (new part, counter-melody, reharmonize, fill, variation, full arrangement of the region).
- **Context packet** built client-side: project key/scale (new top-level `doc.key`), tempo/signature map,
  section/arranger labels, chord analysis per bar (theory.ts), every track's notes in/around the region
  (compressed), instrument roles/ranges, lyrics aligned to bars + syllable stress, emotional arc of the song.
- **Lyrics:** add `doc.lyrics` (sections/lines aligned to bars; import from PadRoom / masterProject). Council
  gets a *Lyricist/Poet* reading: imagery, emotional arc, stressed syllables → melodic contour & rhythm,
  word painting.
- **Council roles (Claude, cloud):** Producer (intent → brief), Composer (harmony/form), Arranger (voicing,
  register, density vs existing tracks), Lyric reader, Critic (checks range, clashes, voice-leading,
  rhythm vs lyric stress) → one revision pass. Persona scaffolding exists in `services/melos/council`.
- **Output:** strict JSON notes (reuse `validateGeneratedNotes`), snap/quantize post-pass, lands as new
  takes/alternate clips (A/B/C) in the region, viewable in roll or score; "regenerate bar 3–4 only".
- Server: dedicated `/api/melos/compose` route on Claude (raise token cap or chunk per section/track,
  streaming), retire the local Qwen dependency from the default path.

---

## 7. Suggested build order

1. **Foundations** (unblocks everything): bug list §0, undo transactions, snap/grid, `doc.key`,
   tempo/time-sig map, selection/clipboard model shared by timeline + roll.
2. **Editing parity:** clip trim/slip/loop/copy, piano-roll multi-select + quantize/transpose/scale,
   CC lanes, automation lanes end-to-end, MIDI export.
3. **MEKA structure:** groups → group patterns → scenes → sections/arranger track → auto-populate timeline;
   live pad recording; engine note repeat.
4. **Glass parity** (mostly small, many shares with MEKA): channel ops, graph lanes, tools, per-channel swing, send to piano roll.
5. **Notation lens** on the piano roll, MusicXML in/out, full score.
6. **Voice:** live hum/sing to track, beatbox to pads, Sing-the-synth worklet.
7. **Council composer** on Claude with full context + lyrics.
8. **Audio depth:** audio recording + comping, elastic audio, sampling/chop for MEKA, routing/buses/sidechain, stems.
