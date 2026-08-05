# On-device Demucs (private stem separation)

> **Do not leave a model file in this folder unless you intend to ship it.**
> `public/` is copied verbatim into `dist/`, and `npx cap sync android` copies `dist/`
> into the APK. A 316 MB model dropped here for local testing silently turned a 132 MB
> APK into a 519 MB one. `.gitignore` prevents the commit, not the bundle. Keep test
> models outside the repo and point `MODEL_URL` at them, or serve from a CDN.


The Breakdown's **On-device · private** studio separation runs Demucs entirely in the
browser via `services/demucsClient.ts` (ONNX Runtime Web). Audio never leaves the device.
The model is **316 MB** (fp32) or **166 MB** (fp16-weights, same runtime memory) so it is
**not committed** — see the warning above before placing one here.

## What to place in this folder

1. **`htdemucs.onnx`** — a waveform-in / 4-stems-out ONNX export of htdemucs
   (input `[1, 2, N]` stereo, output `[1, 4, 2, N]` = drums, bass, other, vocals).
   Good sources: the `demucs-onnx` / `htdemucs_ft` ONNX exports (see the design note).
2. **`ort/`** — copy the `.wasm` (and `.mjs`) files from
   `node_modules/onnxruntime-web/dist/` into `public/models/demucs/ort/`
   (or change `ORT_WASM_BASE` in `services/demucsClient.ts` to a CDN).

Paths are configurable at the top of `services/demucsClient.ts` (`MODEL_URL`, `ORT_WASM_BASE`).

## Gating (already wired)

- **TVs**: on-device is disabled (a server version is coming).
- **Low-end / mobile**: shown with a "runs on your hardware, may take minutes" warning.
- Missing model → the button silently falls back to the instant center-channel split.

## Server tier (for everyone)

A faster server path exists at `POST /api/crossover/stems` (Cloud Run). It's **off by
default** (returns 501). To enable: `pip install demucs` (+ torch) on the box and set
`ENABLE_DEMUCS_STEMS=1`. GPU ≈ seconds/song; CPU ≈ minutes.
