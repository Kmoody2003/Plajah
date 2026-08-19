# Melos Master Suite — Research Digest
2026-08-19. Condensed from five deep-research passes (AI mastering, era profiles, AI-artifact repair, browser amp sim, codebase map). This is the engineering basis for the Project view + mastering engine + amp rack. Design mockups (3 directions): https://claude.ai/code/artifact/7ffd79c8-02da-4885-9f00-96a723564afd

## 1. Architecture verdicts (the load-bearing decisions)

- **ML never generates master audio.** Every credible system (LANDR, Ozone Master Assistant, ITO-Master) uses ML/heuristics to *choose parameters* for a deterministic DSP chain. Our chain: Rust→WASM + native WebAudio nodes in the existing Beats engine; analysis/AI off the audio thread.
- **Matchering recipe** (open source, reimplementable): segment to ≤15s pieces → loudest pieces → 4096-pt boxcar FFT avg spectra per M/S → log-warp + LOWESS smooth (frac 0.0375) → linear-phase FIR matching EQ (cap ±3–4 dB!) → 4-step RMS match → width match (>150 Hz only) → Hyrax limiter (atk 1ms / hold 1ms / rel 3000ms, filtered envelopes).
- **Modern ML tier (later):** DeepAFx-ST / ITO-Master (arXiv:2506.16889, weights public) — encoder predicts params of differentiable EQ+comp+imager+limiter; supports CLAP text conditioning ("warmer") and inference-time refinement. ONNX Runtime Web + WebGPU for offline analysis passes only; never in the worklet.
- **Chain order:** trim → corrective EQ → glue comp → tonal EQ → saturation → M/S → clipper (ADAA, 2× OS) → true-peak limiter → dither (export only).

## 2. What engineers hate about mastering plugins (solve-for list)

1. Assistants set limiter threshold absurdly low chasing loudness → cap default limiter GR at 3–4 dB; route excess into clipper stage; show GR histogram.
2. Limiters dull transients past ~3.5 dB GR → clipper-into-limiter topology; multiple gentle stages beat one deep stage.
3. Over-instantiation (imager+exciter+multiband always on) → "null-first" assistant: minimum chain that reaches target; show what we chose NOT to do.
4. Macro-dynamics flattening (AI masters ~22% less macro-DR) → analyze short-term LUFS contour of whole song; preserve its *shape* (per-section static gain, not compression).
5. Loudness-war pointlessness → gain-compensated "how it sounds on Spotify after normalization" A/B (the killer anti-crush UI).
6. M/S abuse → cap side gain; width matching only >150 Hz; always show correlation.
7. **Album context is the moat**: no AI service does track-to-track consistency. Album mode: anchor track, solve per-track offsets by short-term-loudness-of-chorus (not integrated), one shared tonal target + small per-track deltas, crossfade preview at track boundaries. This IS the Project view's job.

## 3. Loudness / metering spec (implement exactly)

- BS.1770-5 K-weighting (recompute biquads for 44.1k!), M=400ms, S=3s, I=gated (abs −70 LKFS, rel −10 LU, 400ms blocks 75% overlap). LRA = 3s STL 10th→95th pct, rel gate −20 LU.
- True peak ≥4× oversampled polyphase (spec under-reads ≤0.554 dB; use 8× internally). Ceiling −1.0 dBTP.
- PSR (TP − STL; ≥8 healthy, ≤5 crushed), PLR (TP − I). K-12/14/20 (RMS, 0 = −12/−14/−20 dBFS). VU: 300ms 2nd-order underdamped, ~1% overshoot. PPM Type I (5ms int, 20dB/1.5s fallback) / Type II BBC (10ms, 24dB/2.8s).
- Spectrum: 4096–32768 FFT, Hann, log display, tilt +4.5 dB/oct default (offer 3.0). Genre corridors from Pestana AES-135 LTAS (hits decay ≈5 dB/oct 100Hz–4kHz).
- Correlation over 300ms–1s; goniometer M-vertical/S-horizontal with persistence.
- Targets: platforms normalize at −14 (Spotify/YT/Tidal/Amazon), −15 Deezer, −16 Apple. Masters by genre: pop/rock −9..−7, EDM/hip-hop −8..−5, acoustic −16..−10. Dual export: streaming + club/CD.

## 4. Analog warmth DSP

- Tape: CHOW tape (DAFx-19, GPL — reimplement, don't copy): Jiles-Atherton hysteresis (NR 4–8 iter), bias sine pre-hysteresis, head-bump shelf 60–100 Hz @15ips, spacing/gap-loss HF filters, wow (<4Hz) + flutter (>4Hz) fractional-delay mod 0.05–0.3%.
- Tube: `y = tanh(g·(x+b)) − tanh(g·b)` asymmetric (b≈0.05–0.3) → even harmonics; target H2 at −40..−60 dB; DC-blocker after.
- Transformer: leaky integrator → sigmoid → differentiator = LF-concentrated harmonic bloom (Neve signature).
- Aliasing: ADAA 1st/2nd order @2× OS ≈ naive 6–8× OS (Chowdhury). Halfband polyphase cascades for OS.

## 5. Era engine (decade DSP crib)

| Era | Band (HP–LP dB/oct) | Dynamics | LUFS/DR | W&F | THD | Noise | Stereo |
|---|---|---|---|---|---|---|---|
| 1920s | 250–2.5k acoustic / 100–5k elec (12/18) | manual ride + groove clip | SNR 30 | 0.5% | 5% | heavy crackle | mono |
| 1930s | 50–7.5k (12/18) | slow limiter 2dB | SNR 35 | 0.3% | 3% | med crackle | mono |
| 1940s | 40–13k (12/12) | catch limit 2–4dB | DR15 | 0.25% | 2% | crackle + hiss −50 | mono |
| 1950s | 30–15k (12/12) | vari-mu 2–4dB slow | −17 / DR14 | 0.12% | 1.5% | hiss −52 + ticks | mono→narrow |
| 1960s | 50–15k, mono<200Hz | Fairchild/1176 3–6dB pump | −15 / DR13 | 0.1% | 2% | hiss −50 | hard L/C/R pan |
| 1970s | 30–16k, −2dB@14k, head bump +1.5@60 | bus 2–4dB | −16 / DR14 | 0.05% | 1% | hiss −60 (Dolby A) | wide, mono bass |
| 1980s | 20–20k brickwall+ripple | SSL glue 2–4dB, gated verb | −15 / DR13 | 0.03% | 0.3% | none / opt 12-bit SP-1200 grit (26.04k/12b) | very wide |
| 1990s | 20–20k | L1 3–6dB | −12 / DR10 | 0 | 0.5% | clean | wide, smiley EQ |
| 2000s | 20–20k | L2 6–12dB + clip | −7 / DR6 | 0 | 2% clip | opt MP3 swirl | very wide |
| 2010s | 30Hz sub–20k | 4–8dB + sidechain pump | −8 / DR6 | 0 | 0.5% | silent | extreme sides, mono sub |
| 2020s | 30–20k | transparent 3–6dB | −10 / DR9 | 0 | 0.2% | silent | wide, mono-compatible |

Key anchors: RIAA 1954; first stereo LPs Mar 1958; Dolby A 1966/B 1968; CD 1982 (PCM-1610/1630); L1 1994 = loudness war ignition; TC Finalizer 1996. Prior art: iZotope Vinyl's decade switch. Pre-1990 LUFS values are equivalent-loudness reconstructions — label as such in UI.

## 6. Pristine (AI-song repair) — artifact → fix matrix

Suno/Udio artifacts (root cause: RVQ neural codec + 32kHz gen → 16kHz brickwall):
1. **Birdies/shimmer** 5.1–7.2kHz (flickering high-Q bins) → spectral-outlier suppression gated on spectral flatness + transient detect (deshimmer pipeline, MIT — the reference).
2. **Stationary whines** (checkerboard/deconv harmonics 5–16kHz) → persistence-weighted dynamic-EQ de-resonator.
3. **Warble/underwater** → phase-coherence repair: identity phase locking (Laroche-Dolson) / RTPGHI, phase reset at transients. Nobody ships this in a browser — differentiator.
4. **16kHz brickwall** → SBR-style band replication + exciter (cheap, real-time); Apollo (music-native codec restoration, ICASSP'25) as offline WebGPU pass; AudioSR server-only.
5. **Soft transients** → SPL differential-envelope transient shaper (fast 0.1–1ms vs slow 15–50ms follower), multiband optional.
6. **Hiss/diffusion noise 8–16kHz** → MMSE-LSA (Ephraim-Malah, α=0.98, floor −18..−25dB, minimum-statistics noise track). **WARNING: RNNoise/DeepFilterNet/etc are speech-only and destroy music** — never on full mixes.
7. Sibilance smear → split-band de-esser (xover 4.5–5k, detect 5–10k, ratio 3–6:1, atk ≤1ms, rel 20–60ms) + ZCR gating vs cymbals.
8. Narrow/unstable stereo → freq-dependent M/S width (>200Hz), correlation-limited.
RX-class classics (all WASM-feasible): de-click AR-interp (order 30–40, 3σ residual), de-clip A-SPADE (real-time capable) or spline preview, de-hum tracking comb ≤16 harmonics, spectral inpainting Janssen-TF (beats deep nets ≤75ms gaps), de-reverb WPE (mild on music).
Stems: demucs.cpp WASM works but slow + bleed → broadband repair on full mix; stems only for vocal de-ess, drum transients, rebalance.

## 7. Amp rack (browser Guitar Rig)

- **Neural core = NAM.** `neural-amp-modeler-wasm` (TONE3000, MIT, npm): Emscripten NAM core v0.5.4 in an AudioWorklet, single-threaded, no COOP/COEP needed, A2 + slimmable models. TONE3000 hosts ~20k free captures. LSTM lane (Proteus/AIDA-X via RTNeural) for conditioned gain-knob amps, few % CPU.
- **Circuit lane for pedals/tone stacks** (knobs must behave): chowdsp_wdf; port Chow Centaur (Klon, has WDF+RTNeural versions); TS = HPF~720Hz into asym diode clip; Big Muff = 2 clippers + 1kHz scoop. Tone stack math published (Yeh DAFx-06): Bassman C1=250pF C2=C3=20nF R1=250k R2=1M R3=25k R4=56k; JCM800 C1=470pF C2=C3=22nF R1=220k R2=1M R3=22k R4=33k; Vox TB C1=50pF C2=C3=22nF R1=250k R2=1M R3=20k R4=100k.
- Power amp: sag = env follower drooping clip threshold (atk ~5ms rel 50–200ms); presence/resonance = shelves in NFB loop.
- Cab: own partitioned convolver in the worklet (not ConvolverNode), dual-IR mix + 0–1ms delay; free-commercial IR seeds: Bogren, Jester Dyne, God's Cab; Celestion = official licensing path.
- One worklet, one WASM module, whole chain inside; no native-node graphs. 48kHz, latencyHint 0, getUserMedia with EC/NS/AGC OFF. Honest target 15–25ms RT on Chrome/Windows; built-in latency tester.
- Legal: never real amp names ("British Stack 50" convention) + respective-owners disclaimer; NAM core MIT; community captures need per-capture/bulk permission to bundle.
- "Easier" = auto input calibration (the #1 silent preset-killer), presets by song/genre, one-knob Feel morph between two anchor rigs, progressive disclosure, zero install.

## 8. Codebase integration map (from repo exploration)

- **Project tab:** add `'project'` to `BeatsViewId` + `VIEWS` in `components/melos/beats/shared/TransportBar.tsx:10`; `AVAILABLE_VIEWS` in `BeatsRoom.tsx:63`; render switch ~`BeatsRoom.tsx:652`; new `components/melos/beats/project/`. Mobile shell branches at `BeatsRoom.tsx:387` (needs own Mode).
- **Master chain hook:** `services/melos/beats/engine/graph.ts` — extend `eqIn/eqOut` insert slot into ordered rack; `repatchMaster()` (:83) is the single repatch point keeping live/offline identical. Glue comp exists at graph.ts:66 (`glueOn:false`, NO UI — cheapest first win). Limiter −1dB at :70.
- **State:** `GrooveDoc.mixer.master` (grooveDoc.ts:145); add `master.mastering?: Record<string,unknown>` (typed shape lives in fx module, like `SpectraState`); guard in `deserializeGroove` (:246).
- **Metering → React:** only via `EngineSnapshot` in `components/melos/beats/useEngineBridge.ts` (one rAF). LUFS/TP = new AudioWorklet (pattern: `clockProcessor.worklet.js` + `?url` import). NO existing LUFS/TP/correlation code anywhere in repo — greenfield.
- **Reusable:** `fx/spectraEq.ts` (RBJ magnitude solver `curveMagnitudeDb()`), `SpectraPanel.tsx` (canvas scaffolding), `fabula/Waveform.jsx` (min/max/RMS peak pyramid, BUCKET=128 — best waveform code in repo), `SampleThisModal.tsx` (dual-handle range select), `TimelineView.tsx` loop-region drag (:170), `render.ts` offline bounce + `publishGroove()` → `OPEN_ALBUM_CREATOR` event (the Melos→Album bridge), `Track.audioAnalysis.peaks` (precomputed waveform peaks on album tracks — free).
- **Album editor:** `AlbumCreator.tsx` `contentTab` union at :170, tab bar :1195–1233, tracklist body :1589+; no multi-select today (`moveTrack` ↑/↓ only).
- **Album data for Project view:** `MelosArrangement.songIds` (running order) + `MelosSong.trackRef/takes`; GrooveDoc has no album concept → new `melosProductions/{prodId}/projects/{projectId}` collection recommended.
- **Design tier:** Project/mastering = instrument tier → `beats/theme.ts` consts + `slabPanel`; strict color semantics: orange=armed, cyan=playhead/realtime, magenta=selection, purple=brand chrome only, lilac=.dawproject.
- DSP philosophy on record (spectraEq.ts:1–12): native nodes for bus EQ/comp; wasm for audio-rate stuff — mastering follows suit, wasm only where needed (TP oversampling, K-weighting, hysteresis, ADAA clip).
