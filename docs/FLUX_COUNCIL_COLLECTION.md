# Flux — four new generators

Preview locally at http://localhost:3000/flux-gallery.html (`npm run dev`).
The gallery runs the production Flux renderer, with a labelled simulated rhythm,
local audio-file playback, pause, full screen, and the original Tapestry comparison.
Audio files stay in the browser. The gallery HTML is a development entry point;
the generators themselves are registered in the normal Pixels and DJ catalogs.

| Generator | Composition | Motion and audio rule |
|---|---|---|
| Deco Tapestry II | Teal-black woven enamel, a raised brass sunburst, tiered wings, concentric medallion and chevron hem | Locked frontal framing. A slow fan gesture and grazing key light follow clip time. Bass warms brass; treble picks out the thread and fine lines. |
| Flux Lattice | Copper and porcelain meridians around a dark central pearl; 320 instanced beads | Nested orbital motion follows the clock. Midrange opens the mint linework; bass lights the inner copper rings; treble illuminates beads. |
| Flux Tunnel | Vermilion portal ribs, blue hairline inlays and a dark causeway | Deterministic forward procession. Sound changes emissive intensity, not camera speed or position. |
| Flux Aurora | Five pleated translucent light curtains, jade hems, violet heights, a distant moon and dark terrain | Layered, overlapping wave motion follows time. Bands brighten the body, hems and spectral threads. |

All four are actual three.js scenes. Aurora and the woven textile use custom GPU
shaders; the others combine procedural meshes, lines and instancing. They use the
existing Flux camera, audio envelope and bloom pipeline. Per-scene grain lets this
collection keep dark regions quieter while preserving the original scenes' setting.

## Council provenance

The user explicitly requested the existing Art and Motion Councils and approved
sending the creative brief to their configured Anthropic connection. The live run
was attempted on 2026-09-08. Anthropic rejected the configured key (`invalid x-api-key`):
the Art Council returned FAILED, and the Motion Council used its existing
`localAdvice` fallback. **There was no successful live AI deliberation.**

The implemented direction is Codex's interpretation of the stored council lenses:
Classical/Baroque structure and relief for Tapestry II, Futurist/Minimalist orbital
rules for Lattice, Rebel/Classical procession for Tunnel, and Baroque/Minimalist
light with the Animator's overlapping gesture for Aurora. These pairings are
design attribution, not quotes or votes from the failed session.

Applied Motion Council guidance: clock-driven movement; separate band-driven
light and colour; deliberate motion cadence; avoid full-frame beat flashes.
The engine has no temporal motion-blur pass, so the fallback's 180-degree shutter
recommendation is not claimed as implemented. The collection runs continuously;
not every scene is a seamless fixed-duration loop.

`scripts/directFluxCouncil.mjs` reproduces the council run with a local in-memory
store. It uses the existing council protocol and Motion Council prompt; the latter
is sent through the configured Anthropic lane for this standalone authoring run.
It does not update users' production council histories. Raw session output is in
the ignored `artifacts/flux-council/direction.json`.

## Verification

- Targeted TypeScript checks cover the scene builders, Flux renderer, gallery and mode mapping.
- `node scripts/verifyFluxCouncil.mjs` renders each scene at fixed times and audio
  levels, checks visible pixels, measurable audio response and time-varying output,
  and captures PNG proofs. Also checks gallery selection and mobile overflow.
- Chromium's default hardware backend lost its WebGL context during the initial
  check. The successful verification uses SwiftShader software WebGL; it does not
  establish physical-GPU frame rate or device performance.
- The normal catalog wiring exposes the new generators in Pixels Studio and the
  DJ source picker. Fabula integration remains at the state documented separately;
  this change does not add a new Fabula clip type.

Proofs and numerical results: `artifacts/flux-council/`.
