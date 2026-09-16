# Melos Wave & Spectral Repair Suite — Design ("RX-class")

Status: **DESIGN** (2026-09-07). Scoped by Kenne: "build a full wave editing suite in Melos, with
everything RX has for fixing and healing audio." This is the spec + phased build plan. No code yet.

Companion to the Meter Bridge (`services/shared/meterAnalyser.ts` + `components/shared/MeterBridge.tsx`)
and the shared FX core (`services/melos/beats/fx/`). Reuses the on-device DSP pattern already proven by
ONDA (Rust → wasm in an AudioWorklet, `dsp/plajah_audio.wasm`, see [[plajah-onda-instruments]]).

---

## 1. What we're matching (iZotope RX feature map)

Grouped by how they'll be built here. **P#** = target phase.

| RX module | What it does | Our module | Phase |
|---|---|---|---|
| Spectrogram / Spectral Editor | Paint a time-freq selection, act only on it | **Spectral Canvas** (STFT heatmap + lasso/brush/freq-band selections) | P1 |
| Voice De-noise / Spectral De-noise | Learn a noise profile, subtract it | **De-noise** (spectral gate + Wiener, profile-learned) | P1 |
| De-hum | Remove mains hum + harmonics (50/60 Hz) | **De-hum** (adaptive comb of notches) | P1 |
| De-click / De-crackle | Vinyl clicks, mouth clicks, digital ticks | **De-click** (transient-outlier detect → interpolate) | P2 |
| De-clip | Reconstruct clipped peaks | **De-clip** (cubic/AR extrapolation of flat-topped runs) | P2 |
| De-ess | Tame sibilance | **De-ess** (dynamic spectral attenuation 4–10 kHz) | P2 |
| Spectral Repair (Attenuate/Replace/Heal) | Erase a sound, fill from surroundings | **Spectral Heal** (interpolate / pattern-clone across the selection) | P1→P3 |
| De-reverb | Reduce room tail | **De-reverb** (mag-spectrum decay suppression) | P3 |
| De-bleed / De-plosive / De-wind | Situational cleanups | grouped **Dialogue tools** | P3 |
| Mouth De-click / Breath Control | Micro-edits for VO | part of **De-click** + **Breath** gate | P3 |
| Music Rebalance / Stem separation | Pull vocals/drums/bass/other | **Rebalance** (ML source separation) | P4 |
| Dialogue Isolate / Ambience Match | Split speech vs bg; match room tone | **Rebalance** + **Ambience Match** | P4 |
| EQ Match | Match one clip's spectral balance to a reference | **EQ Match** (feeds `spectraEq` curve) | P2 |
| Loudness / EQ / Gain / Channel ops | Utility | already covered by FX core + Meter Bridge | done |

Non-goals for now: surround/Ambisonic repair, RX Connect/ARA host bridge (Melos IS the host).

---

## 2. Architecture

### 2.1 The offline STFT engine (the core everything shares)
A single **worker + wasm** module owns the forward/inverse Short-Time Fourier Transform and the frame
store. Repair is an **offline, non-realtime** operation on a selected region (like RX's editor, not a
live insert) — so it runs in a Worker off the audio thread and writes a new buffer.

- `services/melos/repair/stft.ts` (TS orchestrator) + `dsp/plajah_repair.wasm` (Rust: FFT via `realfft`,
  windowing, overlap-add). Frame size 2048 default (1024/4096 selectable), 75% overlap (hop 512), Hann.
- **Frame store**: for an edited region we hold `Float32Array` mag + phase per frame. Editing mutates
  magnitudes (and, for Heal, phase), then iSTFT reconstructs. Memory-bounded: only the SELECTION's frames
  are resident; the rest streams from the source buffer.
- Every module is a pure function `(frames, params, noiseProfile?) => frames`. This keeps them testable
  headless (feed synthetic frames, assert the magnitude change) exactly like the Meter Bridge tests.
- **Undo**: each apply pushes the pre-image of the touched frames onto a ring (bounded MB), so repairs
  are non-destructive and stackable. Final "flatten" writes the OPFS buffer.

### 2.2 The Spectral Canvas (the UI core)
`components/melos/repair/SpectralCanvas.tsx` — a WebGL2 heatmap (log-freq Y, time X, dB color via a
perceptual LUT). This is the one hard piece; budget it.
- Draw: upload the mag matrix as an R32F texture, color-map in the fragment shader (same shared-GL
  one-context pattern as Fabula's FX preview, see [[plajah-fx-preview-engine]]).
- Selections: **time range**, **freq band**, **rectangle**, **lasso**, **brush** (soft-edged, for Heal).
  Selection = a mask texture the modules read. Modifier keys mirror RX (Shift add, Alt subtract).
- Playback head + solo-selection monitoring (hear only what's inside the marquee).
- Zoom/scroll shared with the waveform lane above it (two synced views: amplitude + spectrogram).

### 2.3 Integration points (reuse, don't fork)
- **Entry**: Melos arranger/mixer clip right-click → "Repair…" opens the suite on that clip's audio
  (audio tracks + rendered instrument bounces). Also the standalone **Wave Editor** view.
- **Fabula** shares it: the `AudioEditor.jsx` cleanup panel (HPF/hum/denoise) becomes the "quick" front
  end; "Advanced repair…" opens this suite. The mastering-engineer Meter Bridge is already shared, so
  the repair suite sits beside it as the second half of the audio-doctor surface.
- **Output**: a repaired clip is a new OPFS buffer (`studio:blob:` substrate, [[plajah-engine-architecture]])
  swapped in on the track; original retained for undo/relink. Never edits the source file in place.
- **Council tie-in**: the Mix/Master engineers ([[plajah-melos-council-composer]]) can *recommend* repair
  moves ("−6 dB de-ess at 7 kHz, hum at 60 Hz +harmonics") that pre-fill a module — the suite is where
  the advice becomes an action.

---

## 3. Module algorithms (concrete enough to build)

**De-noise (P1).** Two-stage. (1) *Learn* from a user-selected noise-only region → per-bin noise floor
`N[k]` (mean magnitude) + variance. (2) *Reduce*: per bin, gain `g = max(reduction_floor, (M−β·N)/M)`
smoothed across time (attack/release) and frequency (bin smoothing) to kill musical-noise artifacts. β =
"reduction" strength; a Wiener variant `g = M²/(M²+β·N²)` for the "smooth" mode. Expose: Threshold,
Reduction (dB), Smoothing, Whisper/artifact control, Output noise-only (audition the removed part).

**De-hum (P1).** Detect the fundamental (50/60 Hz auto or manual) by peak-picking the low-freq average
spectrum; build notches at f0·1..N (harmonics slider). Adaptive: track f0 drift per frame (±few %) so it
follows unstable mains. Static notch = zero magnitude in the bin ± width; "natural" = attenuate toward
the interpolated neighbors. Real-time preview via a live BiquadFilter comb (from FX core) before commit.

**Spectral Heal (P1 core, P3 pattern-clone).** For a selection: (a) *Attenuate* — scale mags down by a
gain. (b) *Replace/Interpolate* — for each bin-column in the selection, fill mag+phase by interpolating
from the frames just before/after (horizontal) and/or bins above/below (vertical); phase gets linear
prediction to avoid clicks. (c) *Pattern (P3)* — copy a same-size region the user points to elsewhere
(clone-stamp) with cross-fade at the seam. This is the "erase a cough/beep" tool.

**De-click (P2).** Detect: per-sample or per-frame outliers vs a short AR prediction (a click is
broadband + short). Mark runs; repair by AR interpolation across the gap (cubic for short, LPC for
longer). Sensitivity + click-width params; "mouth de-click" = tighter width + HF weighting.

**De-clip (P2).** Find flat-topped runs at/near full-scale; reconstruct the missing peak by extrapolating
the surrounding waveform (constrained cubic, or AR). Makeup + ceiling. Works on the *sample* buffer, not
STFT.

**De-ess (P2).** Detect sibilant frames (HF energy ratio 4–10 kHz vs total over threshold); apply
dynamic attenuation only to the sibilant band, only when it fires. Amount, frequency range, "classic"
(broadband duck) vs "spectral" (only the offending bins).

**De-reverb (P3).** Estimate the late-reverb magnitude envelope per bin (a smoothed decaying tail follows
a transient); subtract a fraction of the estimated tail from each frame (spectral subtraction with a
decay model). Amount + tail-length; risk of pumping → conservative defaults + artifact smoothing.

**EQ Match (P2).** Average magnitude spectrum of source vs a reference clip; the ratio (smoothed, in
1/12-oct bands) becomes a target curve fed into the existing `spectraEq` (services/melos/beats/fx/
spectraEq.ts) — so "match" produces an *editable* EQ, not a black box.

**Music Rebalance / Dialogue Isolate (P4).** The one that needs a model. Options, cheapest first:
(a) classic masking (harmonic/percussive + center-channel extraction) for a quick stems split; (b) a
small ONNX source-separation model (Open-Unmix / Demucs-lite) run in a Worker via `onnxruntime-web`
(WASM/WebGPU). Ship (a) as "Rebalance-lite" in P4, gate (b) behind a capability/entitlement + the GPU
reality check ([[plajah-pixels-gpu-ceiling]]). Output = 4 gain-adjustable stems (vocals/drums/bass/other)
or speech/background for dialogue.

---

## 4. UX

- **Two synced lanes**: waveform (amplitude, for de-click/de-clip/trim/gain) on top, spectrogram
  (Spectral Canvas) below. Tools switch which lane is primary.
- **Module rack** on the right (Plajah DS panels): pick a module → its params + a **Learn** button where
  relevant → **Preview** (audition processed / removed-only / bypass A-B) → **Apply** (offline render into
  the undo stack). Multiple modules chain in order.
- **Education, like the Meter Bridge**: each module has a one-line "what it fixes," a "when to use it,"
  and a hover-insight on the spectrogram ("this vertical streak is a click," "this steady line at 60 Hz
  is hum"). Ties into the engineer-knowledge theme Kenne wants throughout Melos.
- **Non-destructive**: A/B against original, undo history, "flatten" to commit. Original always relinkable.

---

## 5. Phasing

- **P1 — Spectral foundation**: STFT worker+wasm, Spectral Canvas (render + basic selections), De-noise,
  De-hum, Spectral Heal (attenuate + interpolate). This alone covers the 80% case (hum, hiss, one-off
  noises) and makes the suite real.
- **P2 — Restoration**: De-click, De-clip, De-ess, EQ Match. Waveform-lane tools + the match curve.
- **P3 — Dialogue & advanced spectral**: De-reverb, pattern-clone Heal, breath/mouth micro-tools,
  de-plosive/de-wind.
- **P4 — Separation**: Rebalance-lite (masking) → optional ML stems (gated), Dialogue Isolate, Ambience
  Match.

Each phase is independently shippable and testable headless (synthetic-signal → assert the spectral
change), the same discipline as `scripts/verifyMeterAnalyser.mjs`.

## 6. Risks / notes
- **Spectral Canvas performance** is the long pole — WebGL heatmap of a long clip needs tiling + LOD.
  Prototype it first; everything else is DSP that's testable without UI.
- **Musical noise** (warbling artifacts) is the quality bar for de-noise/de-reverb — spend time on the
  time-frequency smoothing, not just the subtraction.
- Keep every DSP module a **pure `(frames,params)=>frames`** so the algorithms are unit-tested and the UI
  is a thin shell — mirrors how the Meter Bridge engine was proven before the React port.
- Reuse: FFT/windowing in the SAME wasm crate as ONDA where possible; `spectraEq` for EQ Match; the
  shared-GL context for the canvas; `studio:blob` OPFS for outputs.
