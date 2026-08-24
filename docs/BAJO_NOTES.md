# BAJO — come back to

Written 2026-08-22, at the point BAJO was committed and paused. Everything here is a deliberate
stop, not a bug — the instrument is playable without any of it. Roughly in the order they would
pay off.

## Sound

**1. ~~The wavetable families are not ported.~~** Done 2026-08-23.
`services/melos/instruments/bajo/wavetables.ts` — Analog, Reese, Growl, Fold, Metal, built
additively from a per-harmonic spectrum with a sine lookup (Math.sin per partial per sample was a
visible stall). 16 of the 36 presets now sit on one.

Two things learned building them. The bank is normalised to constant **RMS**, not constant peak
like ONDA's: peak-normalised, the Analog family's sine frame sat 11 dB above its pulse frame and
Fold landed 12 dB under Analog, so the morph knob was a volume knob and the family you picked
changed your level. RMS-normalised with a peak ceiling that is 2.6 dB across a morph sweep and
4.6 dB between families. And **Reese's morph is a phase change, not a spectral one** — the
centroid is identical across all 32 frames by design. On a bare sustained tone that is close to
inaudible, because the ear is largely phase-deaf for steady sounds; it becomes obvious through
unison and through Scorch, which is how every Reese preset uses it. Worth knowing before anyone
decides the table is broken.

**2. ~~29 of the prototype's 36 presets crossed over.~~** Done 2026-08-23 — all 36 are in.
Screech Metal, Big Room Saw, Organ Bass, Phonk Drift, Jump Up Wob, Dune Drone and Gravity Well
landed with the tables they needed. Where the prototype reached for FM or a ring modulator (which
this engine does not have) they use the wobble on Morph instead, which on these tables moves the
formant peak or the comb spacing and is the more musical control anyway.

**3. Scorch stage 3 is not wobble-modulated.** Only stages 1 and 2 take the drive modulation
(`bajo.rs`, `if st < 2`). Arbitrary; it was a CPU hedge. Worth revisiting once the rack has been
profiled.

**4. The Ghost Gate's crossover overlaps in phase.** With every band open it reconstructs
exactly (there is a test). With the top two bands shut, the measured fundamental sits at 1.17×
its ungated level rather than 1.00× — the bands that were removed carried a small phase-shifted
share of it. Audible as a mild lift, not a problem, but a phase-corrected crossover would fix it.

**5. The delay, echo and dimension are stereo-only** (`FX_CH = 2` in `bajo.rs`). A ping-pong
delay has no meaning in 7.1.4 and allocating twelve channels of delay line to find that out would
cost about a megabyte. If BAJO ever needs to be a surround instrument this is the line to change.

## Surfaces

**6. ~~No playhead on the rate lane or the gate grid.~~** Done 2026-08-23. `useBajoTransport`
polls `BeatsEngine.posBeats()` on a frame loop and derives the lane slot and the gate cell with
the same two expressions the Rust engine uses — both sections read the transport themselves rather
than being stepped by the host, so the UI has to derive rather than be told. If either expression
in `bajo.rs` changes, that hook changes with it or the playhead starts lying about what you hear.
Gated on the index actually changing, so it re-renders a few times a bar rather than 60 times a
second.

**7. ~~The Morph Pad and Crossform did not cross over.~~** Both in as of 2026-08-23.

Crossform: pick any two patches, blend the whole instrument between them. Continuous parameters
interpolate; wavetables, the rate lane, the gate grid and anything read as an index or a flag snap
at the midpoint. Folded behind a disclosure, since it rewrites the patch.

Morph Pad: two axes, each wired per-preset to the parameters that matter for THAT sound — the
vowel on a talkbox, damping and body on an upright, the comb spacing on Screech Metal. Twelve
presets carry bespoke wiring; the rest fall back to cutoff on X and Scorch drive on Y. Record a
move and it loops in bars against the transport, and stopping a recording turns the loop on,
because having to find a second button to hear what you just drew is a bad trade.

**Its one real limitation: the loop is driven by the UI, not the engine.** The wobble lane lives
in `bajo.rs` and runs whether or not anything is on screen; the pad's gesture is replayed by a
React effect reading `posBeats()`, so it only plays while the panel is open and the tab is
visible. Close the panel and the morph stops, leaving its parameters wherever they were. Making it
survive that means a path player on the Rust side, reading the same transport the wobble does —
worth doing if the pad turns out to be something people build patches around rather than perform
with live.

**8. The arpeggiator is Melos's, not BAJO's.** BAJO deliberately does not ship its own arp — the
Beats layer already has `arp.ts` and `ArpPanel`. **This has not been tested against a BAJO track.**
It should just work, since BAJO is a normal instrument as far as note handling goes, but confirm
before claiming it.

**9. ~~The editor draws BAJO's parameters only.~~** Fixed 2026-08-23. Metadata was added for the
shared ONDA ids, and an Envelopes section too — a bass instrument with no reachable decay is not a
bass instrument. Engine went 0 → 17 controls, Filter 3 → 8, plus 8 envelope controls.

The caveat that was left behind is closed too: `BAJO_DEFAULTS` in `params.ts` now mirrors
`defaults()` in `params.rs`, so every control reads at the engine's own default rather than at the
middle of its range. Crossform needed the same map — without it, blending an upright bass into a
riddim patch left the string engine at full strength and the gate stuck on, because a parameter
only one side mentions is not the two sides agreeing, it is one side changing it.

## Not yet verified

**The playheads have not been seen moving, and neither has pad loop playback.** Both are driven by
`requestAnimationFrame`, and the browser throttles that to about 4 fps when the pane is not
composited — which is every session I have had. The index arithmetic is verified directly against
the Rust derivations (lane slot, all three gate rates, loop phase, negative positions under
`rem_euclid`), and the pad's drag path is verified end to end against a stubbed engine. What is
unverified is the frame loop actually turning those into movement on screen.

**10. Offline render.** The rack lives inside the engine specifically so an offline bounce is
identical to live. That is the design, and the determinism test covers the voice path, but nobody
has bounced a BAJO track and compared.

**11. CPU under load.** Three Scorch stages at 2× oversampling, a four-band gate and a string
delay line, per voice or per block as applicable — never profiled with real polyphony. The
presets default to mono with glide, which hides it.

**12. ~~The panel has not been opened in a browser.~~** Done 2026-08-23. Mounted against the dev
server and driven through the DOM: the panel renders, the rate lane shows the preset's real
pattern and edits, lane presets apply, the wobble toggle writes param 1440, the editor opens with
all eight sections, and painting a gate cell updates the grid. All 29 presets deserialise and
produce finite engine params.

Not covered: no screenshot (the Browser pane would not composite in that session, so the evidence
is DOM-level, not visual), and the panel has still not been reached through the real Melos UI —
only mounted in isolation. Audio was never heard; `BeatsEngine` was not running, so `setParam`
calls were no-ops against a null instrument.

## Fixed along the way

**The gate grid could not be saved.** `grid: number[][]` was the only nested array in any
persisted Melos type, and **Firestore cannot store an array of arrays** — `setDoc` throws and
takes the whole groove document with it, not just the BAJO patch. Any project containing a BAJO
track would have failed to save. The step sequencer hits the same wall and works around it with a
nested map (`steps: Record<number, Record<number, Step>>`); the grid is always exactly 4 x 16 so
it flattens to a 64-entry band-major run instead, rebuilt on load. `deserializeBajoPatch` reads
both shapes. Fixed 2026-08-23, before anything was ever saved.

**An instrument dropped on a pad was labelled "ONDA" in ONDA's purple** unless it was KERA — the
name and colour were inlined in three places. Now `instrumentLabel()` / `instrumentColor()` in
`instrumentFactory.ts`, which fixes it for the meditation suite too.

The Veil's `V_SIZE` is a continuous 0..1 size (a 0.25x..2.8x line-length multiplier), but BAJO's
presets were written against it as though it were a menu of six named rooms — so `RV.SIZE: 5` was
asking for a room thirteen times oversized, in 23 presets. The parameter metadata was labelling it
as an enum, which is what invited the mistake. Both corrected 2026-08-23.

`BeatsEngine.ts` had a top-level `const isSuiteType` pasted inside the class body — invalid JS,
which broke the whole module and therefore `BeatsRoom`, every instrument panel and the entire
Melos Beats room in the browser. It typechecked as TS1248 and was committed. Hoisted to module
scope 2026-08-23. It arrived with the meditation-suite commits, not with BAJO, but it was blocking
everything downstream.

## Repo notes

- After touching `rust/plajah-audio`, run `npm run audio:build` and **commit the `.wasm`** — CI has
  no Rust toolchain. `DSP_ABI_VERSION` in `InstrumentHost.ts` must match `ABI_VERSION` in
  `lib.rs`; both are at 8.
- The Phase-0 Web Audio prototype is the reference for anything above. It is a published artifact,
  not in the repo — it is a 2,500-line single file whose whole purpose was to be thrown away, and
  the parts worth keeping are already here.
- `FONDO` was the placeholder name in the instrument picker. It is gone; the two stale comments
  that still mention it are in `services/melos/instruments/presetArt.ts` and
  `components/melos/beats/instrument/PresetGallery.tsx`.
