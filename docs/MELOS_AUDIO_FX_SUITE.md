# Melos / Fabula Audio FX Suite — Inventory & Design

Status: **DESIGN / INVENTORY** (2026-09-07). Scoped by Kenne: a 30-band surgical EQ (Studio One Pro EQ
class); study Studio One / Bitwig / FL Studio effect lists + iZotope + non-overlapping Waves + EastWest
Spaces, and build a comparable audio FX suite for **Melos AND Fabula** (they share the FX core); and a
Guitar-Rig-level amp with a comparable GUI + stock presets. This is the audio parallel to the video
[[MELOS_RX_REPAIR_SUITE]] / Fabula FX Suite work — inventory first, then build in waves.

The two apps already share the audio FX core (`services/melos/beats/fx/`, imported into Fabula via
`services/fabula/audioFx.ts`), so every device built here lands in both.

---

## 1. What we already have (28 devices + amp rig)

`services/melos/beats/fx/devices.ts`: **eq** (4-band + HP/LP), **comp** (Dynamics), **gate**, **saturator**,
**imager**, **dehum**, **deess**, **reverb**, **spaces**, **delay**, **chorus**, **flanger**, **phaser**,
**tremolo**, **autopan**, **vibrato**, **rotary**, **comb**, **ringmod**, **autofilter**, **gater**,
**beatmasher**, **limiter**, **transient**, **bitcrush** (Bit-8), **trim**, **pristine**, **amprig** (Amp
Rack). Plus `spectraEq.ts` (dynamic EQ, already has a `mode: 5 | 30` + `expandTo30`), `mastering.ts`
(era/engineer mastering chain), `ampModels.ts` (amp + cab + pedal models). All pure Web Audio /
`FxChainHost`, engine-agnostic, tested via `npm run test:dsp`.

So the base covers EQ, dynamics, saturation, modulation, time, stereo, a limiter, a mastering chain and a
guitar rig. The gaps are **surgical/linear-phase EQ, multiband dynamics, the specialist mix tools, the
creative/glitch set, convolution, and Guitar-Rig-depth amps**.

---

## 2. Reference inventory (deduplicated across vendors)

Grouped by category; **[have]** = covered, **[gap]** = to build, **[improve]** = exists but shallow.
Vendors abbreviated: S1 = Studio One, BW = Bitwig, FL = FL Studio, iZ = iZotope, W = Waves, EW = EastWest.

### EQ
- Pro EQ 30-band surgical (S1 Pro EQ³, iZ Ozone EQ, W Q10) — **[gap] Surgical EQ** (see §3).
- Dynamic EQ (S1, iZ, W F6) — **[have]** spectraEq dynamic bands (surface it as a device).
- Linear-phase EQ (iZ, W Linear Phase) — **[gap]** a linear-phase mode on the surgical EQ.
- Vintage/console EQ colour (W API/SSL/Pultec-style) — **[gap] Console EQ** (musical, saturating).

### Dynamics
- Compressor (all) — **[have]** comp. **[improve]**: add ratio/knee/attack-release curve + FET/Opto/VCA voicings.
- Multiband compressor (S1 Multiband, iZ, FL Maximus, W C6) — **[gap] Multiband Dynamics** (3–5 band, on the STFT/crossover core).
- Limiter / maximizer (iZ Maximizer, W L2, FL Soft Clipper) — **[have]** limiter; **[improve]** true-peak + character modes.
- Bus / glue compressor (S1, W SSL Comp) — **[gap] Glue Comp** (SSL-style bus).
- De-esser (S1, iZ) — **[have]** deess.
- Expander / Gate — **[have]** gate; **[gap]** upward expander.
- Transient shaper (S1, BW, SPL) — **[have]** transient.
- Envelope follower / sidechain modulation (BW) — **[gap] Envelope Follower** modulator (ties to Motion).

### Saturation / distortion / amp
- Saturator / tape / tube (S1 Console Shaper, FL, W) — **[have]** saturator; **[improve]** tape + tube + transformer modes.
- Bitcrush / decimator (FL, BW) — **[have]** bitcrush.
- **Guitar amp + cab + pedals — Guitar-Rig-level** (§4) — **[improve]** amprig is a start; expand to rack + components + presets.
- Console/tape emulation on the bus — **[gap] Tape** (wow/flutter/sat).

### Time / space
- Reverb algorithmic (all) — **[have]** reverb, spaces.
- **Convolution reverb (EW Spaces, S1 OpenAIR, W IR-1)** — **[gap] Convolution** (IR loader; EW-Spaces-class with a stock IR library).
- Delay (all) — **[have]** delay; **[improve]** ping-pong/tape/diffusion/ducked modes.
- Grain / freeze / shimmer (BW Grid, FL) — **[gap] Grain/Freeze** creative.

### Modulation
- Chorus/flanger/phaser/tremolo/vibrato/rotary/ring-mod/comb/auto-pan/auto-filter — **[have]** (strong set already).

### Stereo / mastering / metering
- Imager / M-S (iZ, W S1) — **[have]** imager.
- Mastering chain (iZ Ozone, S1 Project) — **[have]** mastering.ts + the Meter Bridge + Music Council.
- Multiband exciter / harmonic (iZ Exciter, BBE) — **[gap] Exciter**.

### Repair (separate initiative)
- De-noise / de-click / de-clip / spectral heal — **[design]** the RX-class suite ([[MELOS_RX_REPAIR_SUITE]]).

### Creative / glitch (Bitwig/FL flavour)
- Beat-repeat / masher — **[have]** beatmasher, gater.
- Vocoder (BW, FL) — **[gap] Vocoder**.
- Frequency shifter (BW) — **[gap] Freq Shifter** (distinct from ring-mod).

---

## 3. The 30-band Surgical EQ (Pro EQ³ class) — first build

Leverage `spectraEq.ts` which already models bands + a `mode: 30` + `expandTo30`. Build a dedicated
**Surgical EQ** device/UI:
- **30 bands** on a log grid, each bell/shelf/HP/LP/notch, gain ±24 dB, Q 0.1–24; drag on the curve.
- **Analyzer overlay** (RTA from the shared meter/FFT) behind the curve — draw-to-EQ.
- **Solo/listen** a band (band-pass monitor) to find the resonance; **auto-Q** while dragging.
- **Dynamic** per band (already in spectraEq): threshold + range so a band ducks only when it rings.
- **Linear-phase** toggle (FIR) for mastering; **mid/side** per band.
- Curve is analytic (`curveMagnitudeDb`) so the display == the processing.
This is one device that covers surgical, dynamic, linear-phase and M/S — the Pro EQ + F6 + Ozone EQ in one.

---

## 4. Guitar amp → Guitar-Rig level

`ampModels.ts` already has amp voicings, cabs, and pedals. Expand to a **rack**:
- **Components**: input → pedals (drive/mod/delay/reverb, chainable, reorderable) → amp head (gain/EQ/
  presence/master + voicing) → power-amp sag → cab (IR or modelled) + **dual-mic** (mic type + position
  blend) → rack FX. Guitar Rig's model.
- **GUI**: a rack view — drag components, per-component panels, a signal-flow strip. Plajah DS, not a skeuomorph, but component-clear.
- **Stock presets**: a comparable library — clean/crunch/lead/metal/bass/acoustic-sim/ambient, per amp,
  ~60–100 presets, named generically (original voicings, like the broadcast packs — no trademarked names).
- Optional: an **IR loader** for real cab impulses (shares the Convolution engine from §3).

---

## 5. Architecture & rules
- Every device stays a pure `FxChainHost` node (`input`/`output`/`setParams`/`dispose`) so it drops into
  Melos channels, Fabula strips, and the offline album/video render unchanged.
- Heavy DSP (multiband splitter, convolution, linear-phase FIR, vocoder) → Rust→wasm in the worklet (the
  ONDA pattern) where Web Audio nodes aren't enough; light stuff stays native Web Audio.
- **Original voicings only** — no trademarked model names (matches the broadcast-pack + amp-model rule).
- Each device: params + presets + an analytic curve/meter where relevant; tested via `npm run test:dsp`.

## 6. Phased build
- **Wave 1** — Surgical EQ (30-band, analyzer, dynamic, linear-phase, M/S). Highest-ask, mostly leverages spectraEq.
- **Wave 2** — Dynamics depth: Multiband Dynamics, Glue Comp, upward expander, comp voicings; Limiter true-peak/character.
- **Wave 3** — Guitar rack + components + dual-mic + preset library + IR loader.
- **Wave 4** — Convolution reverb + EW-Spaces-class stock IR library; Tape; Exciter; delay modes.
- **Wave 5 — DONE ✓** Creative: **Freq Shifter** (FIR-Hilbert SSB, ~59 dB image rejection), **Vocoder** (20-band, internal saw+noise carrier, audio-rate envelope followers — renders offline), **Freeze Cloud** (jittered granular tap-cloud, near-infinite hold), **Console EQ** (musical fixed-band colour + always-on transformer saturation). All measured in `scripts/verifyCreativeFx.mjs`; preset banks + registered in `DEVICES`.
- **Wave 4 (remaining)** — Convolution reverb + EW-Spaces-class stock IR library; Tape; Exciter; delay modes.
- Repair suite ([[MELOS_RX_REPAIR_SUITE]]) runs in parallel as its own initiative.

Each wave ships to BOTH Melos and Fabula through the shared FX core, and each device is presets + tests.
