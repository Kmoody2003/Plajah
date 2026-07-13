# Fabula Audio Page — Editor, Cleanup & Stem Separation

Status legend: ✅ shipped · 🟡 partial · ⬜ planned (Crossover tier)

The audio page is Fairlight-class but oriented toward **musical / scoring** work: a reference monitor to
cut to picture, a non-destructive clip editor, and stem separation. Heavy ML runs on the **Crossover
tier** (native/cloud), exactly like the SAM 2 matte plan — the browser stays real-time and honest.

## Shipped (browser, real-time)

- ✅ **Reference monitor** on the audio page — the program frame at the playhead (reuses `MonitorLayer`,
  muted), aspect-locked to the project format, with a transport toggle. Score/mix to picture.
- ✅ **Non-destructive AudioEditor** (`components/Fabula/AudioEditor.jsx`) — Sound Forge-style waveform +
  live-audible cleanup. Everything is a parameter on `clip.audio.clean` (`CleanSettings` in
  `services/fabula/audioGraph.ts`); nothing is ever written back into the media.
  - High-pass (rumble/hum) · Low-pass (hiss) · Hum notch (50/60 Hz) · Trim gain — all live via biquads
    in both the live graph (`applyClean`) and the render (`applyCleanRender`).
  - Denoise (time-domain gate below an auto-estimated noise floor) + Normalize (peak → −1 dBFS) — baked
    per-clip at render (`bakeCleanBuffer`), previewed as a param in the editor.
  - **Send-clip-to-editor** from the right-click menu and the audio-page clip list — works on standalone
    audio clips AND a **video clip's linked audio** (same `clip.audio` model; `resolveClipBlob` pulls the
    audio track out of the mp4/webm via `decodeAudioData`).
- ✅ **Instant stem split** (`services/fabula/stemSeparation.ts` → `quickStems`) — right-click →
  *Isolate vocals + music*. Mid/side (center-channel) extraction in an `OfflineAudioContext`: the side
  signal (L−R) cancels center-panned vocals → **music**; the center estimate → **vocals-forward**. Real,
  offline, immediate. Each stem lands on its own new audio track at the clip's position.

## Crossover tier (ML — open-source, MIT)

Contract already wired client-side (`separateStemsCloud` → `POST /api/crossover/stems`); the browser
falls back to `quickStems` with an honest toast until the endpoint is deployed.

- ⬜ **HQ 4-stem** (`mode:'4stem'`) — **Demucs v4** (htdemucs, MIT). Returns `{ vocals, drums, bass,
  other }` WAV/URLs → Fabula drops each on its own track. This is the "split music + sound FX" ask done
  properly (drums/bass/other = the instrumental + FX bed; vocals = dialogue/singing).
- ⬜ **Voice diarization split** (`mode:'voices'`) — **pyannote.audio** (MIT) speaker diarization +
  per-speaker isolation (or Demucs vocals → diarize → mask). Returns `{ voices:[url…] }`, one WAV per
  detected speaker → one track each. This is "detect the different voices to their own tracks."
- ⬜ **FX isolation** — Demucs `other` stem, or a dedicated SFX model, surfaced as its own track.

### Server shape (to build on the Crossover box, next to the SAM 2 worker)
```
POST /api/crossover/stems  { url, mode: '4stem' | 'voices' }
  4stem  → { vocals, drums, bass, other }         # Demucs htdemucs
  voices → { voices: [url, …] }                   # pyannote diarization + per-speaker isolate
```
GPU worker: `demucs -n htdemucs <in>` for stems; `pyannote/speaker-diarization-3.1` for voices, then
render each speaker's regions to a stem. Upload results to Storage, return signed URLs. Same job queue,
auth, and result-caching as the video (SAM 2 / proxy) tier.

## Why ML isn't in the browser
Demucs/Spleeter and pyannote are hundreds of MB of weights and need real GPU/CPU throughput; ONNX ports
exist but are far too slow/heavy for an interactive editor. The instant mid/side split covers the fast
path; the Crossover tier covers quality — mirroring the SAM 2 decision in `GPU_GRADE_AND_SAM2_PLAN.md`.
