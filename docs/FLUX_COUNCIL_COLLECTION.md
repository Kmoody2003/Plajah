# Flux Atelier — transforming tapestry and three original installations

Preview: http://localhost:3000/flux-gallery.html (`npm run dev`).

The gallery uses the production Flux renderer. Choose an audio file or click
**Play test groove**: both play actual PCM through the same media element and
AnalyserNode. There are no simulated visualizer bands. Bass/mid/high input meters,
a response-gain control, pause, full screen and original-tapestry comparison are
available. Files remain local to the browser. The gallery is a development entry;
the scenes also register in the normal Pixels and DJ catalogs.

| Generator | Design and transformation |
|---|---|
| Deco Tapestry II | 24 procedural arrangements across palace fans, floral courts, stepped lattices, feathers, city spires, scales/lace, guilloche and celestial mosaics. Continuous topology morphs follow musical beats; energy jumps accelerate transitions and reorientation. Intensity reveals ornament and vocal presence bends the threads. |
| Porcelain Tide | More than a thousand beveled ceramic scales over a stone basin. Bass raises wave crests; mids fold the scales; treble exposes copper edging. |
| Velvet Bloom | A suspended, pleated crimson couture sculpture. Bass opens its silhouette and depth; mids twist individual petals; treble catches silk ridges. |
| Prism Archive | Fifteen suspended dichroic glass volumes. Bass spreads and fans the pages; mids turn them; treble lights the edges and a stylized spectral projection across the plinth. |

The earlier Lattice, Tunnel and Aurora studies remain available. The new three
concepts are additions, not renamed versions of those catalog entries.

## Audio correction

The old broad arithmetic FFT average could reduce a narrow kick to a negligible
value. `fluxBandsFromFreq` now uses physical 30–250 / 250–2400 / 2400–12000 Hz bands
with an RMS/peak blend. Live hosts pass the analyser's sample rate. Silence remains
zero. The new scenes use audio to deform geometry/patterns, not only brightness.
The fixed-time render proof uses bands captured from an actually playing WAV.

## Council provenance

The user approved a live council call on 2026-09-08. Anthropic rejected the configured
key as invalid: the Art Council failed, and the Motion Council returned its existing
localAdvice fallback. There was no successful live AI deliberation. These designs
are Codex's interpretation of the stored council lenses and the user's subsequent
direction, not council votes or quotations. The user explicitly requested visible
transformation; that direction takes precedence over the stored lens's advice to
restrict audio to light and color. No image-model output was used. After user clarification, II retains the initial brass sunburst design and morphs its actual geometry; it does not reuse the first tapestry's circular embroidered kaleidoscope.

The standalone `scripts/directFluxCouncil.mjs` saves its session locally and does
not update production account histories. Existing raw results remain under the
ignored `artifacts/flux-council/` directory.

## Verification

- `node node_modules/tsx/dist/cli.mjs --test tests/fluxAudio.test.ts`: narrow-kick
  response, sample-rate/FFT-size band classification, silence and real PCM fixture.
- `node scripts/verifyFluxCouncil.mjs`: real test-groove playback, uploaded WAV
  decoding and analyser values; four fixed-time renders contrasting silence with
  captured audio; later-time transformation; pause, comparison, selection and
  phone overflow checks. Captures active, quiet and later PNGs for visual review.
- Targeted TypeScript compilation covers both scene modules, the runtime and gallery.
- Render verification uses Chromium SwiftShader software WebGL. The default hardware
  backend lost its context in the earlier run; no physical-GPU FPS claim is made.
- No new Fabula clip type is introduced by this work.

Proof PNGs and numerical audio/render results: `artifacts/flux-council/`.

## Musical morphing and entry points (September 9)

Deco Tapestry II now uses 24 equal-topology seeds (144 paths each), with a stateful musical director. Calm music holds a seed for 16 beats and morphs over 8; energetic music selects every 2 beats and morphs over 1.25. Strong onsets or energy jumps can interrupt with a .65-beat transition, starting from the current blended geometry. Musical beat position controls progress; intensity reveals additional ornament and vocals curve the threads. Vocal detection is a harmonic/formant estimate, not source separation. The gallery offers automatic conducting or inspection of each seed. Uploaded gallery tracks receive background tempo analysis of up to 90 seconds of audio;
Pixels and the DJ host use independent live music samplers. The gallery displays tempo,
intensity and vocal estimates. `tests/decoMusic.test.ts` covers continuity and independent
controls, plus silence/noise/tone rejection and a voiced harmonic fixture.

Discover contains four individual Flux cards that open Pixels with the chosen scene
already applied. The shared preset shelf exposes all four under Presets and Templates.
The browser verification checks their registrations and captures each Deco configuration.
Firebase App Check can reject the headless browser when the catalog initializes Firebase;
that unrelated service failure is recorded separately from rendering errors.

Android debug build `dist-apk/Plajah-Native-UI-20260909-debug.apk` adds an APK-owned
Native UI button on phones/tablets, independent of the remotely loaded website's version.
Native settings provide the return to Classic. `assembleDebug --offline` passed; this
build has not been installed or exercised on the user's physical device.

The native live-content build replaces all sample Home/Chora/Reello/Lorea data with public records from the configured production Firestore database. It filters private/draft/future-scheduled records, loads actual artwork, and opens real content IDs in the existing Capacitor player/reader. Browsing is native; playback, reading, account and purchase flows remain Classic. The read-only production smoke check returned 41 public albums and 49 videos. No private user data or administrative credentials are used.
