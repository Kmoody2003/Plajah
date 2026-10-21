# Melos private music lab

## Prompt workflows in the existing studio (October 20, 2026)

The inline Timeline generator now exposes three workflows, with audio/MIDI choices
for the first:

- **Timeline Part · Audio / MIDI**: use the existing region handles and bar presets.
  MIDI targets one of ONDA, AURA, BAJO, VELA, CANTUS, ISON or PNEUMA and loads the
  same factory preset described to the composer. Short one-bar MIDI regions work;
  audio regions must last at least ten seconds.
- **Full DAW Project**: starts at beat zero, uses at least 32 bars, and appends a
  complementary audio layer, three active synth/MIDI tracks and section markers.
  Qwen first creates a validated form and chord map, then composes short phrases
  against that map with the actual factory preset descriptions. The audio renderer
  receives the same plan and is asked to leave the synth roles free. Existing
  material is retained. Save/export with the studio's existing project controls.
- **Music Track**: generates a complete audio arrangement without additional MIDI.
  The existing Generate panel also creates individual tracks, parts and samples.

All model jobs use the authenticated Music Lab backend. An unavailable or failed
engine no longer silently produces browser synthesis under a model's name.
The legacy `ace-step-2.5` identifier is retained for saved callers, but is labeled
as an ACE-Step quality preset, not a distinct checkpoint release.

The arrangement is prompt-conditioned, not sample-accurate score-conditioned audio.
Listen for harmonic/timing drift before committing a mix. MIDI has conservative
initial levels/pans and the complementary audio starts at -6 dB. These are starting
mix settings, not measured mastering. CANTUS supplies wordless formant textures,
not intelligible lyric vocals. KERA is excluded from automatic preset selection
until an actual sample program is supplied. Basic Pitch is available for explicit
recording transcription; it is not falsely credited for composed MIDI.

Use HeartMuLa explicitly through the Generate panel when configured. The project
orchestrator prefers it for vocal requests when authorized/configured, otherwise
uses ACE-Step. These are alternate renderers; independent full-song recordings
are not layered and called phase-aligned stems.

### Local score runtime

In addition to Ollama, the score adapter supports the installed GGUF model through
`MELOS_QWEN_PYTHON` and `MELOS_QWEN_GGUF`. The launcher detects the existing
`D:\\Plajah Models\\llm\\Qwen2.5-7B-Instruct-Q4_K_M.gguf` and the platform's embedded
Python when present. Each composition worker exits after its request, releasing
weights/KV cache before audio rendering. A VRAM preflight refuses loading when
other workloads leave insufficient memory. This is not a global GPU lock across
unrelated platform processes.

`MELOS_ACE_THINKING=true` enables the ACE 5Hz planning LM for full audio requests.
The launcher uses the 0.6B LM by default for this 8 GB GPU; an explicit existing
`ACESTEP_LM_MODEL_PATH` wins. With no thinking flag the adapter uses DiT only.
Do not force DCW on every checkpoint: the installed API warns that incompatible
checkpoints can distort with it enabled. The adapter leaves that choice to the
runtime and uses documented inference fields.

### Training preparation and quality target

`scripts/prepare_melos_training.py` inventories recordings without altering their
source folder. The user-selected K-Moody folder was inventoried into
`artifacts/melos-training/k-moody-inventory-2026-10-20/manifest.json`: **21 stereo
192 kHz recordings, 93.4 minutes**. Both Sacred Ascension versions are retained as
separate examples and grouped as one composition for split assignment. Review
other composition groups manually. No filename is treated as a reliable caption,
genre, key, BPM or lyric annotation.

Inventory usage (with the ACE-Step environment interpreter):

```powershell
python scripts/prepare_melos_training.py --source '<recording folder>' --output '<new inventory folder>'
```

Review the manifest's captions, BPM, key, language, vocal type, lyrics and
composition IDs, then set `reviewed: true`. Assign distinct compositions to
`train`, `validation` and `test`; related versions must remain in the same split.
The preparation tool refuses unreviewed data and split leakage, preserves every
version, and stages ACE-compatible audio/JSON/lyrics sidecars:

```powershell
python scripts/prepare_melos_training.py --manifest '<reviewed manifest.json>' --output '<new dataset folder>'
```

Only preprocess/train the **train** directory. Validation chooses checkpoints;
test compositions and evaluation prompts remain untouched. The audio inspection
samples nine two-second windows; it does not measure integrated LUFS, true peak,
intelligibility, musicality or complete-track clipping. Stereo masters do not
provide isolated-vocal, stem or MIDI supervision.

**No model weights were fine-tuned by this change.** The installed ACE-Step LoRA
tutorial specifies 16 GB minimum / 20 GB recommended; this GPU has 8 GB, and a
lower-memory training method has not been verified. The adapter/runtime and
reviewed training data must be ready before a run is launched.

Suno/ElevenLabs parity remains an unverified target. Evaluate the base model and
each adapter on fixed unseen prompts across cinematic scoring, EDM/dubstep,
hip-hop and vocals. Use blind listening for composition, long-form development,
groove, timbre, artifacts, vocal intelligibility and mix translation; record seeds,
actual checkpoint IDs and real loudness/peak measurements. Do not infer general
musical intelligence or benchmark parity from a small style adapter.

Focused checks:

```powershell
node scripts/testMelosGeneration.mjs
node --import tsx --test tests/musicEnginePolicy.test.ts
python -m unittest discover -s tests -p test_melos_training.py
node scripts/previewMelosGeneration.mjs
```

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
32 GB system RAM. The launcher defaults to the 0.6B planning LM, CPU offload and
one candidate. Set `ACESTEP_INIT_LLM=false` for DiT-only operation when memory is
limited; `MELOS_ACE_THINKING` follows that launcher setting. The adapter requests
`batch_size=1`. Qwen is unloaded after each request (`keep_alive=0` with Ollama,
or process exit with the native worker). HeartMuLa uses a CPU codec and lazy
loading, but its actual memory fit still needs testing. YuE2's official full
preset calls for 24 GB VRAM; this adapter does not pretend that a GGUF engine is
interchangeable with the official Python API.

After installing ACE-Step in `artifacts/melos-runtime/ACE-Step-1.5`, run:

```powershell
./scripts/startMelosMusicLab.ps1
```

The launcher runs ACE-Step on loopback with a per-session API key and starts Melos
with the matching configuration. Set `MELOS_OLLAMA_URL` and start a separately
installed Ollama instance with `ollama pull qwen3:8b` for MIDI composition, or use
the existing GGUF/Python configuration described above.

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
