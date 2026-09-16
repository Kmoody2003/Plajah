# Melos private music lab

Sign in as a platform admin, open **Melos Studio → Generate** from MEKA, Glass or
Timeline. The panel creates audio clips, MIDI notes, samples and transcriptions.
The Admin Dashboard's **Music Lab** lists configured engines and permission status.

## Insertion

- Audio: new or existing audio track, at the chosen beat. Preview before inserting
  or use **Generate & insert**.
- MIDI: new or existing instrument track; ONDA, BAJO or VELA for new tracks.
- MEKA / Glass: a new instrument pad and new pattern. These editors share the same
  pattern data. Notes are quantized to sixteenths; patterns hold at most four bars
  and a four-octave span. Longer/wider scores can be inserted in Timeline instead.
- Sample: generate an instrumental excerpt with ACE-Step, audition it, select a
  start and length, and insert on an empty/new pad. A 5 ms edge fade avoids clicks.
  ACE-Step's minimum generation is 10 seconds; this is not a specialist one-shot
  percussion model, so evaluate sample quality before use.
- Basic Pitch: choose a recording and transcribe to notes locally in the browser.
  It works best on a single instrument or separated stem.
- SheetSage2: optional offline Python transcription to notes plus downloadable ABC.
- YuE2: generate an ABC score and editable notes, or a complete audio recording
  with downloadable ABC. Score edits regenerate the whole recording. Requested
  seconds are not an exact duration control for YuE2.

Insertion is undoable. Existing clips/pads are not replaced. Generated audio is
stored in device OPFS, not automatically published or uploaded. Export a Melos
project to retain portable audio. Pending jobs are not persistent across server
restarts; results expire after 30 minutes and at most three are retained.

## Runtime configuration

All variables below are **server-only**. Never use a `VITE_` prefix for credentials.
An endpoint in this configuration is reached by the Melos Node server, not the
browser. For a laptop GPU, run the Melos server on the laptop too. A cloud Melos
server cannot reach the laptop through its own `127.0.0.1`.

| Engine | Configuration |
| --- | --- |
| ACE-Step 1.5 | `MELOS_ACE_URL=http://127.0.0.1:8001`, `MELOS_ACE_TOKEN` matching its API key |
| Qwen via Ollama | `MELOS_OLLAMA_URL=http://127.0.0.1:11434`, `MELOS_QWEN_MODEL=qwen3:8b`, optional `MELOS_OLLAMA_TOKEN` |
| HeartMuLa | `MELOS_HEARTMULA_PYTHON` absolute environment interpreter, `MELOS_HEARTMULA_MODEL` downloaded HeartLib model directory |
| YuE2 | `MELOS_YUE2_PYTHON`, `MELOS_YUE2_MODEL`, `MELOS_YUE2_VAE`, `YUE2_EVALUATION_PERMISSION_REF` |
| SheetSage2 | `MELOS_SHEETSAGE2_PYTHON`, `MELOS_SHEETSAGE2_MODEL`, `SHEETSAGE2_EVALUATION_PERMISSION_REF` |

Use separate Python environments: HeartMuLa recommends Python 3.10, SheetSage2
3.10/3.11, YuE2 3.12. Install each official project's requirements; the worker also
needs `music21` for YuE2 ABC conversion and `pretty_midi` for SheetSage2 MIDI
conversion. Models and dependency models must already exist locally. The worker
sets Hugging Face / Transformers offline mode and performs no downloads.

On this laptop, the GPU reports RTX 4070 Laptop, **8188 MiB VRAM**, with about
32 GB system RAM. Start ACE-Step with its LM disabled, CPU offload and one
candidate. The adapter requests DiT-only generation and `batch_size=1`. Qwen is
unloaded after each request (`keep_alive=0`). HeartMuLa uses a CPU codec and lazy
loading, but its actual memory fit still needs testing. YuE2's official full
preset calls for 24 GB VRAM; this adapter does not pretend that a GGUF engine is
interchangeable with the official Python API.

After installing ACE-Step in `artifacts/melos-runtime/ACE-Step-1.5`, run:

```powershell
./scripts/startMelosMusicLab.ps1
```

The launcher runs ACE-Step on loopback with a per-session API key and starts Melos
with the matching configuration. Set `MELOS_OLLAMA_URL` and start a separately
installed Ollama instance with `ollama pull qwen3:8b` for MIDI composition.

## Access and permissions

Every `/api/admin/music-lab` operation requires a verified Firebase token and a
server lookup of the caller's `admins` document. Media downloads additionally
check job ownership. No engine in this lab is publicly available, including when
evaluation permission is recorded. Requests fail closed on permission lookup
errors. The frontend gets no operator tokens, paths or agreement references.

YuE2 and SheetSage2 require written evaluation permission before executing their
weights. The reference variables record an operator assertion about a received
agreement; they do not obtain or verify permission. No permission reference has
been set and no permission request has been sent. Public launch requires a
separate reviewed policy change.

The Node service permits one active job per process, with a 20-minute timeout.
Run one server process for this laptop configuration. Cancelling ACE-Step stops
Melos insertion, but its API has no documented task-cancel endpoint: the GPU slot
stays reserved until its submitted task completes or times out. Python workers
are terminated on cancellation. Public production use would need persistent
jobs, shared resource limits and private durable artifact storage.

## Checks

```powershell
npx tsx --test tests/musicEnginePolicy.test.ts
node scripts/testMelosGeneration.mjs
node scripts/previewMelosGeneration.mjs
```

The first two cover access control, ownership, cancellation, insertion and API
contracts. API tests use fixture servers, not model inference. The preview uses
the real panel with supplied engine states and writes screenshots to
`artifacts/melos-generation-ui`; it does not exercise authenticated generation.

## Upstream references (checked September 11, 2026)

- https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md
- https://huggingface.co/ACE-Step/Ace-Step1.5
- https://github.com/HeartMuLa/heartlib
- https://huggingface.co/Qwen/Qwen3-8B
- https://github.com/spotify/basic-pitch
- https://github.com/multimodal-art-projection/YuE#license
- https://huggingface.co/m-a-p/SheetSage2
