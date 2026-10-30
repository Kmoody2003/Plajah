# Chora — GPU audio scope (2026-10-28)

Question: can Chora's sound engine use the GPU (and the rest of the machine) so playback never
struggles? Short answer: yes, but the GPU is the **third** step. The biggest gain is getting
Chora's audio off the browser's single audio thread, and the desktop app has no native audio
engine to put GPU work into yet.

## Where Chora's audio runs today

- **Everything renders inside the WebView**: one `AudioContext`, every instrument an
  `AudioWorklet` running the Rust engine compiled to WASM (`rust/plajah-audio` →
  `services/melos/beats/engine/dsp/plajah_audio.wasm`). A browser renders all worklets of a context
  on **one real-time thread — one CPU core**, however many cores the machine has.
- **The desktop app (WinUI 3, `windows-native/`) has no native audio output.** ASIO is
  capture-only (`AsioMultitrackRecorder.cs`, playback provider `null`); WASAPI devices are listed
  but never opened; no native mixer, DSP or VST processing. Native GPU work today is only the LLM
  (llama.cpp on Vulkan). Stem separation in `PlajahAiNativeService` is a mock.
- **Already possible:** `rust/plajah-audio` is `cdylib + rlib` with a flat C ABI and has been built
  as `plajah_audio.dll` — the same engine can run natively without a rewrite.

## What actually costs CPU (measured)

Single core, WASM engine, default patches, held notes (bench: scratchpad `bench.mts`, real patch code):

| Instrument | 1 voice | 8 voices | 16 voices |
|---|---|---|---|
| AURA (vintage analog, circuit model + racks) | 8% | 39% | **77%** |
| SOMA (physical percussion) | 4% | 23% | 39% |
| VELA (modal resonator) | 5% | 18% | 31% |
| LYRA (physical models, ≤7 voices) | 2% | 5% | 8% |
| Drum Synth, 12 pads on 16ths — live graph | — | — | 106% |
| Drum Synth, same — cached hits (shipped a9139d79) | — | — | 9.5% |

So one polyphonic AURA pad plus a busy kit already fills the single audio core. Idle instruments
now cost ~0 (idle skip, a9139d79).

## GPU audio — what's real

- **GPU Audio (gpu.audio, now "Soundcore for Pro Audio")**: C++/CMake SDK; processors with ports in
  a graph; a CPU host scheduler batches work for a GPU device scheduler (~100–200 µs launch windows).
  Ships examples for FIR (partitioned convolution), IIR, Neural Amp Modeler and real-time source
  separation. Free to build with, **commercial license required** (terms not public). NVIDIA and
  AMD supported; Intel iGPUs not stated. Latency claims (96-sample buffers) are vendor figures.
  [github.com/gpuaudio/gpuaudio-sdk](https://github.com/gpuaudio/gpuaudio-sdk) ·
  [Sound On Sound](https://www.soundonsound.com/news/gpu-audio-update-their-sdk) ·
  [Synthtopia, Feb 2026](https://www.synthtopia.com/content/2026/02/10/gpu-audio-announces-pro-audio-division-soundcore-gpu-powered-real-time-source-separation-solution/)
- **Anukari** (mass-spring physics synth) launched on GPU (Metal/CUDA/OpenCL) and **moved back to
  CPU SIMD**: per-sample barriers left most GPU threads idle, threadgroups capped instrument size,
  and another GPU app (VJ software) starved it into glitches.
  [devlog](https://anukari.com/blog/devlog/anukari-on-the-cpu-part-1-gpu-issues)
- **AMD TrueAudio Next / Steam Audio** run convolution on reserved compute queues so graphics can't
  starve audio — the precedent for doing it safely.
  [GDC 2019](https://gpuopen.com/gdc-presentations/2019/gdc-2019-s3-powering-spatial-audio.pdf)
- **The browser can't do real-time GPU audio**: WebGPU isn't reachable from the audio thread; a
  round trip through the main thread is far too slow and jittery for a 128-frame callback.

What maps well to a GPU: many independent voices or partials (modal banks, unison, big polyphony),
long convolution reverbs, neural models (stem separation, amp/drum models), offline bounces. What
maps badly: tightly coupled per-sample work (one string, one filter), and anything that must answer
in a few ms while the GPU is drawing Plajah's visuals.

## Recommended path

**Phase 0 — stop wasting the core we have (done, a9139d79).** Cached drum hits, idle skip.
Next cheap wins still on the table: SIMD in the Rust voices (WASM SIMD128 / native AVX2) for AURA
and SOMA, which is where Anukari found its speed.

**Phase 1 — native audio engine in the desktop app (the big one).**
- Load `plajah_audio.dll` in the WinUI host; output through **WASAPI exclusive** (and ASIO output
  for interfaces), the same devices the app already lists.
- Render each track/instrument on its **own worker thread** and mix — a 16-core machine gets 16×
  the headroom of the browser's one audio core.
- The web app stays the UI and sends the doc + transport over the existing web-message bridge; the
  WebView engine remains the fallback on web/phone (same Rust engine, same sound).
- Anticipative rendering: sequenced tracks render ahead of the playhead in big blocks (as Reaper's
  anticipative FX does); only the armed/live track runs at the smallest buffer. This is also what
  makes GPU work viable, because the GPU then gets large blocks with time to spare.
- Rough size: several weeks; needs a Windows device test matrix (ASIO interface, onboard audio).

**Phase 2 — GPU for the workloads that fit, inside the native engine.**
- Candidates, in order: real stem separation (replaces the mock), long convolution reverb / cabinet
  IRs, modal banks for VELA/SOMA, high-voice-count AURA in render-ahead tracks, faster bounces.
- Two ways to build it:
  - **GPU Audio SDK** — fastest route to working GPU DSP with their scheduler; C++ module behind
    the native engine; license cost and NVIDIA/AMD-only.
  - **Own compute path** — D3D12/Vulkan compute (the compositor already depends on `wgpu`, though its
    renderer is a stub); no license, any GPU, but we build the scheduling ourselves.
- Always with a CPU fallback per processor, a reserved/high-priority compute queue, and a health
  check that drops a processor back to CPU if the GPU misses deadlines (Anukari's VJ-glitch case
  is exactly Plajah's: visualizers run on the same GPU).

## Decisions

1. Build Phase 1 (native engine) before wiring GPU work into playback? — still recommended.
2. Target hardware — **decided: every vendor** (Intel, AMD, NVIDIA, Qualcomm ARM, Apple Silicon),
   so **our own compute path**, not the GPU Audio SDK (license + NVIDIA/AMD only).

## Milestone 1 — `rust/plajah-gpu-dsp` (2026-10-28)

A standalone crate on **wgpu 25** (the same version as `compositor/`), with kernels in **WGSL**.
It has its own `[workspace]`, so the WASM build and the shared `rust/Cargo.lock` are untouched.

- `src/shaders/modal.wgsl` — **modal resonator bank**. One thread per mode (complex one-pole
  `z' = r·e^{iω}·z + g·x`, i.e. a damped two-pole resonator in coupled form, stable in f32).
  Modes run in 64-mode workgroups. A 64×64 shared tile (exactly the 16 KB WebGPU default) is
  summed every 64 samples: **two barriers per 64 samples, never one per sample** (the Anukari
  trap). A per-bank reduce pass follows. Banks = voices, each with its own excitation signal.
- `src/shaders/conv.wgsl` — **uniformly partitioned FFT convolution** (overlap-save, FDL).
  `fwd` transforms every new block of a render-ahead call at once, `mac` runs one thread per
  (bin, block, channel), and `inv` inverts every block at once. The input-spectrum ring stays on
  the GPU. B = 16…1024 (an FFT of up to 2048 fits in 16 KB of shared memory).
- **CPU references** (`modal.rs`, `fft.rs`, `conv.rs`) follow the kernels' operation order —
  same recurrence, same 8-lane + tree sum, same butterflies and f32 twiddle table — so they agree
  to rounding (drivers may fuse multiply-adds). They are also the fallback.
- **Health / fallback** (`health.rs`): each block has a deadline (default: 50% of the block's
  audio duration). A late block is rendered on the CPU from the last good state. The GPU then
  sits out a cooldown that doubles on repeat misses (4 → 256 blocks) and halves after clean
  blocks. Modal state is read back with every block. The convolver keeps P·B samples of
  time-domain history so either side can rebuild its delay line at a hand-over.
- **D3D12 needs DXC.** wgpu's default FXC compiler never finished the modal kernel (> 5 min).
  `gpu::dxc_dir()` loads `dxcompiler.dll` + `dxil.dll` from `PLAJAH_DXC_DIR`, from next to the
  exe, or from the Windows SDK. **The desktop app ships them**: `Plajah.WinUI.csproj` pulls
  Microsoft's `Microsoft.Direct3D.DXC` NuGet package (1.9.2609.5) and copies the build platform's
  pair (x64 / ARM64 / x86) next to `Plajah.WinUI.exe`, with the licence texts in
  `licenses\dxc\`. The tests pass on D3D12 with that copy. Even with DXC, the first D3D12
  pipeline build takes 4–6 s (Vulkan: ~50 ms), so build pipelines off-thread at startup.

### Correctness (`cargo test --release`, 6 tests, all pass)

Max error / peak, GPU vs CPU reference, on all four paths here (Intel Arc and RTX 4070 laptop,
each on Vulkan and D3D12):

- Modal: **≤ 4.3e-6** over 4 blocks. The drift grows slowly with stream length.
- Convolution: **≤ 2.4e-7**. CPU convolution vs direct f64 convolution: < 1e-5.
- Forced deadline misses mid-stream: across GPU → CPU → GPU hand-overs, both processors' output
  matches a pure-CPU run to rounding.
- Browser WebGPU vs the JS port of the reference: modal 1.1e-6, conv 2.2e-7.

### Speed (`cargo run --release --example bench`)

One render-ahead call = 8192 samples (171 ms at 48 kHz). Times are wall clock per call,
including upload, kernels and readback — what a deadline sees. CPU = the reference on one thread,
native x64 (not the WASM engine). All figures are medians. Other sessions were using the machine
at the same time, so results vary by ±30% between runs.

| Workload | CPU ref | Intel Arc iGPU (Vulkan / D3D12) | RTX 4070 laptop (Vulkan / D3D12) |
|---|---|---|---|
| Modal 1,024 modes (16 voices × 64) | 5.1 ms (3% RT) | 2.0 / 4.3 ms — 2.5× / 1.2× | 1.1 / 8.1 ms |
| Modal 4,096 (16 × 256) | 35 ms (21% RT) | 3.1 / 3.6 ms (**1.8% RT**) — 11× | 8.0 / 9.7 ms — 4× |
| Modal 16,384 (64 × 256) | 205 ms (**120% RT**) | 6.9 / 7.4 ms (**4% RT**) — **30×** | 16 / 18 ms — 12× |
| Modal 65,536 (128 × 512) | 940 ms (551% RT) | 21 / 24 ms (12–14% RT) — 40–46× | 9.1 / 10 ms — 90–100× |
| Conv 2 s stereo (B 512, P 188) | 4.6 ms (3% RT) | 1.3 / 1.2 ms — 3.5× | 0.2 / 1.9 ms |
| Conv 6 s stereo hall (P 563) | 38 ms (22% RT) | 2.1 / 2.0 ms — **18×** | 3.1 / 4.0 ms — 10–12× |
| Conv 8 stereo sends × 2 s | 117 ms (69% RT) | 3.7 / 5.1 ms (2–3% RT) — **23–32×** | 7.0 / 7.6 ms — 16× |
| Conv 10 s true-stereo (4 ch, P 938) | 98 ms (57% RT) | 4.9 / 5.1 ms — **20×** | 5.7 ms — 17× |

On the iGPU, the slowest single call in every workload stayed under 12 ms. The dGPU had rare
45–50 ms outliers on the biggest modal bank.

**Contention** (`bench -- <filter> --contention`): a second device keeps the same GPU saturated
with back-to-back compute (a stand-in for the visualizers) while a 16,384-mode bank renders 30
blocks. Latency roughly doubles (Intel D3D12 worst case 33 ms, others ≤ 19 ms) against an 85 ms
deadline: **0 misses, 0 CPU fallbacks**. The drivers time-slice the GPU fairly between the two
devices. A visualizer issuing single dispatches longer than the budget would still trip the
fallback; the tests exercise that path.

**Browser WebGPU** (`gpu-dsp-lab.html`, same WGSL, headless Edge): on the RTX 4070, modal 16,384
took 9–26 ms (5–15% RT), 65,536 took 33–43 ms, and every convolution case took 6–16 ms (≤ 9%
RT). On this Optimus laptop, Edge always gives WebGPU the NVIDIA GPU (neither `powerPreference`
nor the Chromium switches moved it to the Intel GPU), so the iGPU numbers are native-only. The
lab's CPU column is a plain-JS port of the reference, kept for the match check. It is far slower
than the WASM engine, so the lab's "speed-up" column is not a fair comparison.

### What the numbers say

- **The GPU pays off at scale, and the Intel iGPU does best** (shared memory, no PCIe readback).
  Below ~1–2k modes, or for a single short reverb, the CPU reference is already cheap and the
  per-call overhead (≈1–2 ms on the iGPU) dominates. At mid sizes the dGPU is often *slower* than
  the iGPU: it drops to idle clocks between bursts and reads back over PCIe (it got faster under
  load in the contention run). For the native engine: prefer the iGPU for audio and leave the
  dGPU to visuals.
- **Today's instruments are too small to benefit.** SOMA has 16 membrane + 4 shell modes per
  voice and VELA is in the same range, so 16 voices ≈ 320 modes: CPU territory. The modal kernel
  opens a *new* class of sound that the CPU can't render at all: bells, plates, gongs, cymbals
  and bodies with hundreds to thousands of modes per voice, at full polyphony. (16k modes = 120%
  of a core on the CPU, 4% on the iGPU.)
- **Convolution is useful right away.** A session with several long reverbs on sends goes from
  most of a CPU core to ~2–3% of real time on any GPU.

### Lab

`npx vite --config gpu-dsp-lab.vite.config.mjs` → http://127.0.0.1:3188/gpu-dsp-lab.html
(`?power=low-power` asks for the integrated GPU where the browser honours it). Results are on
`window.gpuDspLab`. Launch config: `gpu-dsp-lab`.

### Next (as of milestone 1)

Item 3 is done: see milestone 2 below. Still open:

1. **Phase 1 native engine** (unchanged): native render-ahead in big blocks needs the native host.
   Wire `Convolver` / `ModalBank` in behind it.
2. Browser path: render-ahead convolution for web/Mac users from a worker, with results posted
   into the AudioWorklet's ring buffer (never on the audio thread itself). Note that Chrome's
   own `ConvolverNode` already runs long tails on a background thread, so this is lower priority.
3. Non-uniform partitioning (a small head partition on the CPU, the big tail on the GPU), so
   reverbs can use the GPU even on the live/armed track.
4. Test on AMD, Qualcomm Adreno (ARM64 Windows: the arm64 DXC DLLs already ship) and Apple Silicon
   (Metal), in f32 throughout, as on the Intel GPU.

## Milestone 2 — SOMA deep skin, wired into the live engine (2026-10-28)

The first GPU work Chora actually plays. SOMA steps 16 membrane modes against its striker on the
CPU and, since the realism pass (83a03fcb), stands in for everything above them with an 8-band
noise cloud. Now, when WebGPU is available, **every strike also gets a GPU-rendered "deep skin":
the real circular-membrane modes above the explicit 16**. That means every (m, n) Bessel mode up
to 18 kHz, up to 2,048 per strike, each m ≥ 1 mode as two detuned orientations (a real head's
uneven tension makes them beat). The voice plays the deep skin inside its own top-skin radiation,
and the noise bands it replaces go quiet.

How it fits together:

- **Physics (TS, `services/melos/instruments/soma/deep/deepModes.ts`)**: SOMA's own laws for each
  preset (base pitch, skin material, chamber decay, viscoelastic overtone law, air-radiation cap,
  strike position, articulation, radiation efficiency, mode pan), continued past mode 16.
  Bessel zeros come from Miller's recurrence (checked against reference values). Two deliberate
  departures:
  - **Footprint:** SOMA's Gaussian striker footprint is replaced by a disc law (2·J1(x)/x
    envelope). The Gaussian erases everything past j ≈ 20.
  - **Calibration:** each strike's deep layer is matched, per half-octave band, to the *level and
    decay* of the cloud for that same strike. Open-loop modes alone came out ~35 dB short above
    2 kHz: a smooth contact force has little HF, and the cloud's level is what the realism pass
    measured and approved. So the cloud sets how much energy each band gets and how fast it fades,
    and the real modes decide how it is distributed.
- **Drive**: `pa_soma_excitation` (ABI 16) runs a SOMA voice on the instrument's exact
  parameters and records the force it feeds its membrane (contact + slap/whip noise + rim wave)
  plus the cloud's output. The GPU modes are driven by that force, open-loop. High modes barely
  move the striker, so that is the right physics.
- **GPU**: the same `modal.wgsl` as `rust/plajah-gpu-dsp`, through browser WebGPU
  (`gpuModal.ts`). That covers the WebView2 desktop app, Chrome/Edge and Safari, on any vendor.
  Everything runs in a Web Worker (`deepWorker.ts`), so neither the audio thread nor the UI
  thread does any of it.
- **Playback**: `somaDeep.ts` caches layers per preset × note × 8 velocity levels × 2 variants
  (64 MB LRU). `Instrument.noteOn` sends `noteOnDeep` when the layer is cached: it uploads it to
  an engine sample slot, and the voice adds it into `top_skin`, so mic perspective, shell, early
  room and the Veil all apply. Otherwise it sends a normal note-on and requests the layer. Offline
  bounces (`render.ts`) warm every SOMA note first, so the print is deep from the first hit.
- **Fallback**: no WebGPU, a lost device, a GPU error, or a batch slower than 6 s → strikes play
  exactly as before (cloud), with a doubling cooldown before the GPU is tried again.
  `localStorage['chora.somaDeep'] = 'off'` switches it off by hand.

Measured in the lab (`soma-deep-lab.html`, real engine via the worklet, dry):

| Preset | HF (2–16 kHz) energy, cloud → deep, at 5 / 20 / 50 / 100 ms (dB) | HF crest @30 ms |
|---|---|---|
| 29" Dresden Timpani | 28.0→30.1 · 18.4→19.7 · −0.3→−0.7 · −28.2→−31.4 | 16.2 → 18.5 |
| Lenke Djembe (open) | 24.2→26.9 · 10.1→12.9 · −19.5→−17.2 · −66.6→−66.5 | 15.1 → 19.2 |
| Havana Conga (open) | 16.3→18.5 · −5.4→−2.7 · −49.5→−48.0 · −112→−112 | 15.9 → 15.1 |
| Istanbul Darbuka (tek) | 34.5→36.1 · 19.6→20.7 · −9.8→−10.8 · −55.9→−55.4 | 17.2 → 23.5 |
| Kerry Bodhrán | 21.7→27.9 · 9.4→15.5 · −13.5→−10.0 · −51.0→−51.7 | 14.1 → 18.5 |

- **Envelope:** the deep skin keeps the approved envelope to ±3 dB (the bodhrán starts ~6 dB
  hotter).
- **Structure:** its spectrum is a few dB peakier than noise, because these are real, beating
  partials and not filtered noise. Whether that reads as more "real" is for the ear: the WAV
  pairs are in `artifacts/soma-deep/` (local, gitignored).
- **Mode counts:** every one of the 36 presets builds a set; most strikes get 600–2,048 modes.
  Centre-struck bass presets (Gun Bass, Tumba, Udu) excite almost only the axisymmetric modes,
  which is the physics of a centre hit.
- **Timing:** the first deep strike of a new note arrives ~1.1 s after the first press, which
  plays on the cloud. Warming all 36 presets × 16 strikes (592 strikes) took 23 s in the
  worker: ~43 ms of GPU per 16-strike batch, and the rest is worker CPU (strike recording +
  calibration, ~50 ms per strike).
- **Live path verified:** first press = `noteOn` (cloud), next press = `noteOnDeep`, audible.
  Engine test added to `dsp.test.mjs` (49 pass).

### Next for the deep skin

1. A toggle and status chip in the SOMA panel (left alone here: another session has it open).
2. Speed up warm-up: share calibration between the two variants, and a small worker pool.
3. Tension glide on the deep modes (the explicit 16 glide on hard strikes; the deep ones are
   fixed per strike). The kernel would need per-block frequency scaling.
4. The same treatment for VELA (bowls, bells, gongs), where thousands of modes matter most.

## Milestone 3 — native multi-core render pool (2026-10-30)

`rust/plajah-audio-host`: one `plajah-audio` engine per track, rendered across cores by `RenderPool`
and mixed in track order. Workers register as Windows "Pro Audio". No device output or app wiring yet,
so **nothing in Chora plays through it**. Test: `cargo test --release -p plajah-audio-host` (the mix is
bit-identical to serial at 2–32 threads). Bench: `cargo run --release -p plajah-audio-host --example bench [tracks] [voices] [seconds]`.

Paced 128-frame blocks (2.67 ms) on the Core Ultra 9 185H, with other work on the machine at ~27%:

| Workload | 1 thread: load, late blocks | 12 threads: load, late blocks |
|---|---|---|
| 8 AURA tracks × 8 voices | 120%, 419 of 1125 | 46%, 50 of 1125 |
| 32 AURA tracks × 8 voices | 461%, 1125 of 1125 | 90%, 316 of 1125 |

- Throughput tops out at about 5× around 12 threads, with no gain beyond that. The cause isn't isolated
  (E-cores, shared memory bandwidth and other load are all candidates).
- **It would still drop out at 128 frames.** Spikes hit a fixed-cost loop as hard as the engine (p50 414 µs,
  p99 3 ms), so they come from scheduling, not DSP. Flush-to-zero made no real difference. Pro Audio
  priority helped a little. Render-ahead for sequenced tracks and larger device buffers are the next test.

Next: WASAPI output on this pool, render-ahead, then the web-message bridge from the app.
