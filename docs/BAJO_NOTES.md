# BAJO — come back to

Written 2026-08-22, at the point BAJO was committed and paused. Everything here is a deliberate
stop, not a bug — the instrument is playable without any of it. Roughly in the order they would
pay off.

## Sound

**1. The wavetable families are not ported.** The prototype had five morph families — Analog,
Reese (phase-smeared saw), Growl (moving formant peak), Fold, Metal — and the factory bank leans
on them for character. The Rust core has a full wavetable path already (`O_MODE = 0`,
`O_TABLE`, `tables.rs`, and ONDA's `wavetables.ts` generators), so this is a matter of writing the
generators and uploading them, not new DSP. Until then every BAJO preset uses the analog
oscillators. It is the single biggest gap between the prototype's sound and the shipped one,
and it is why the Reese and Growl presets are approximations.

**2. 29 of the prototype's 36 presets crossed over.** Missing: Screech Metal, Big Room Saw,
Organ Bass, Phonk Drift, Jump Up Wob, Dune Drone, Gravity Well. Most were built on the wavetable
families, so they follow item 1.

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

**6. No playhead on the rate lane or the gate grid.** Both components accept a `playStep` prop
and both currently receive nothing, so the pattern is editable but not *readable while playing* —
which is half of why you would draw one. It needs the transport's current 16th from `BeatsEngine`;
the plumbing does not exist yet.

**7. The Morph Pad and Crossform did not cross over.** The prototype's XY pad with recordable,
tempo-locked gesture playback, and the preset-to-preset interpolator. Melos has Motion, which
covers some of the same ground — the decision to make is whether the pad is a genuinely different
gesture or a second way to do the same thing. Crossform is a smaller job and is arguably the
better demo of what the instrument spans.

**8. The arpeggiator is Melos's, not BAJO's.** BAJO deliberately does not ship its own arp — the
Beats layer already has `arp.ts` and `ArpPanel`. **This has not been tested against a BAJO track.**
It should just work, since BAJO is a normal instrument as far as note handling goes, but confirm
before claiming it.

**9. ~~The editor draws BAJO's parameters only.~~** Fixed 2026-08-23. Metadata was added for the
shared ONDA ids, and an Envelopes section too — a bass instrument with no reachable decay is not a
bass instrument. Engine went 0 → 17 controls, Filter 3 → 8, plus 8 envelope controls.

One caveat left behind: `BajoEditor`'s `val(id, fallback)` shows 0.5 for any continuous parameter a
preset never set, which is not necessarily the engine's default for that id. Stepped and toggled
controls now fall back to 0, which IS the engine's default (that mismatch had the editor showing
"Square" while the engine played "Saw"). The continuous case needs a real defaults map exported
from `params.rs`'s `defaults()` to be exactly right.

## Not yet verified

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
