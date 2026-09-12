# Plajah Media Engine: platform architecture decision

Scope: Pixels, Fabula, Ambo, Chora, DJ, Melos, live production, recording and export. The first runtime slice below is implemented; the rest remains the migration target.

## Implemented runtime slice (September 6, 2026)

- `services/mediaEngine/audioRuntime.ts` owns one browser audio device and separate product output buses. Fabula, Pixels audio, Chora's routed audio, DJ and Melos Beats now obtain that device. Melos disposal disconnects its graph without closing other products' device. Native/background media playback and offline rendering retain their existing paths. Sharing this device does **not** yet unify all DSP/instrument graphs.
- `indexedVideo.worker.ts` uses pinned Mediabunny 1.55.7 to demux and decode source timestamps through WebCodecs off the main thread. Each worker has an 8 MiB input cache; the browser adapter permits two workers. This bounds this adapter, not every existing platform decoder or total decoder memory.
- `frameRequests.ts` permits one outstanding decode plus the latest pending demand. Seeks invalidate previous presentation generations; transferred frames are closed after presentation or discard. Disposal terminates the worker. Unresponsive decoders time out after 15 seconds.
- Fabula Edit exposes **DECODER COMPAT / INDEXED · PREVIEW** in the persistent timeline toolbar. Compatibility remains the default until project/hardware acceptance. Indexed preview feeds the existing Pixels effects/compositor through an SDR canvas (maximum preview width 1920). Audio keeps scheduled ownership or the existing element fallback. Unsupported, rotated, failed or over-budget sources return to compatibility playback. Export, Color/VFX source decoding, Ambo and live video source adapters have not switched.
- Validation: real browser VP8 encoding and worker decoding, source-frame timestamps, forward/backward seeks, malformed-media fallback, worker cleanup; unit tests for latest demand, stale-frame release and independent audio teardown; existing local WAV playback, timeline boundary and effects tests.

Not yet established: Temudune reproduction, long-duration multitrack reliability, 4K HDR precision/output, zero-copy GPU surfaces, shared streaming PCM/DSP/instrument adapters, global decoder arbitration, or performance across Intel/AMD/NVIDIA/Qualcomm/ARM hardware. No NPU backend is introduced by this slice. These remain rollout gates, not inferred benefits from a successful build.

## Decision

Build a shared platform media runtime, retaining Pixels as its creative render graph and retaining the existing Melos instruments/DSP. Replace Fabula's playback orchestration incrementally. Do not replace the platform with another isolated editor engine, and do not make the Pixels visualizer transport responsible for editing or broadcast scheduling.

The runtime owns media identities, source access, timestamped frames/audio blocks, resource budgets, graph execution, color transforms, and output adapters. Products own documents/projects, UI, routing and transport policy. This parallels Tela's role as a common document/data engine without conflating every application's workflow.

## Evidence from the current implementation

| Area | Current implementation | Consequence |
|---|---|---|
| Fabula transport | Large React component, HTML media elements, cut-boundary state updates, audio clock with drift correction | No deterministic contract for the exact decoded frame at a requested time; state timing can choose the wrong clip |
| Cut selection | Millisecond-rounded boundaries and a second frame rounding of playback state | A cut can fire before its actual time, or leave the outgoing clip selected until the following cut; corrected in this change |
| Decode ownership | Separate hidden media warmers, visible/warm monitors and thumbnail elements | Several consumers decode the same sources without sharing decoded frames; redundant warmers removed and thumbnail pressure reduced |
| Proxies | Local originals excluded from proxy selection/build policy; automatic remote proxy work | Local storage removes network latency, not codec cost. Long-GOP 4K local media can still require proxies. Proxy generation must have lower priority than playback |
| Audio | Chora/DJ already share a context when supplied; Fabula, Melos Beats and Pixels can create separate contexts/graphs | Common clock/output/DSP infrastructure is incomplete. Melos disposal closes its context, so simply handing it another product's context would break that product |
| Pixels | Existing reusable shader programs, effect passes, temporal history, generators and graph targets | Valuable rendering foundation; preserve effect contracts and upgrade the storage/color/runtime underneath |
| Color | `core/glUtil.ts` allocates RGBA8 targets; `fabula/gpuComposite.ts` uses rgba8unorm source textures; preview includes CSS paths | Existing GPU operation does not establish HDR precision or preview/export parity |
| Media Engine | `services/mediaEngine` already provides live sources, routing, switching and native bridge contracts | Extend this platform surface; don't create a competing third media-engine concept |

## Runtime design

**Time and transport.** Use rational frame rates (e.g. 30000/1001), integer frame indices for the project, source presentation timestamps and integer audio sample positions. Preserve source VFR timestamps and convert explicitly to project time. Maintain separate timeline, live and export clocks mapped to a session audio clock. Use generation IDs for every seek, graph revision and source replacement: obsolete asynchronous work must never publish a frame or audio block into a new generation.

**Media access and decode.** Use stable asset identity plus source revision, independent of temporary object URLs. Resolve authorized disk handles, local cache and local proxies before remote access. Index/demux source packets in workers; seek from the appropriate keyframe and decode forward to the requested presentation timestamp. Use bounded WebCodecs queues where supported, with explicit release/close of frames, and an element/native adapter where required. A shared broker prioritizes audible audio and program frames over look-ahead, thumbnails, proxies, scopes and background analysis. Cancel stale requests rather than finishing every outstanding seek. Stream audio in bounded blocks instead of decoding entire video files to PCM.

**Pixels render graph.** Make every source adapter produce a timestamped frame/texture with declared dimensions, alpha convention and color metadata. Video, shader generators, stills, Ambo slides, lottie and MilkDrop enter the same composition contract. Keep legacy WebGL effect implementations working through adapters; migrate passes to WebGPU only when correctness and timing demonstrate a benefit. Avoid per-layer canvas readbacks and repeated uploads. Pool GPU targets, cache unchanged branches, fuse compatible passes, and reset temporal effect history on discontinuities. Stateful generators need deterministic stepping/checkpoints for scrubbing and export; live animations alone cannot provide exact seeking.

**Shared audio.** Introduce a session-owned AudioContext/output router with per-product buses and explicit ownership. No product may close or suspend the platform context. Reuse Melos's worklet instrument host, insert/send effects, automation, metering and loudness modules through common node/parameter contracts. Fabula schedules clip audio and instruments on that infrastructure; Chora and DJ keep their streaming/deck behavior. Offline export runs the same DSP definitions against an offline clock. Sharing a context alone is not sharing the DSP engine, and sharing a clock must not make unrelated product transports start or stop together.

**Color and HDR.** Preserve bit depth, primaries, transfer function, matrix coefficients, range and alpha metadata from decode to output. Convert into a declared linear-light working space and use supported floating-point intermediate targets. Effects authored for display-referred SDR require explicit compatibility transforms rather than changing their appearance silently. Apply one output transform for the actual SDR/HDR target, with explicit tone/gamut mapping. Scopes must identify which signal they measure. Export and preview share color transforms; HDR display availability and codec support are capability-tested and reported honestly. A P3 canvas or 4K resolution alone is not HDR fidelity.

**Resolution and performance.** Keep project/export resolution independent of viewport/preview resolution. Use measured frame deadlines and memory pressure to select preview scale, proxy tier and optional scope/thumbnail cadence. Never silently alter export quality, timeline timing or grading parameters. A 3840×2160 RGBA16F surface is approximately 63.3 MiB before other resources; temporal effects can multiply that quickly. Integrated GPUs are the baseline, so budgets must include shared CPU/GPU memory, active surfaces and frame queues. Do not assume every effect stack can run in real time at 4K.

**Live and Ambo.** Live output uses a bounded latency target and may discard late frames. Editing retrieves a requested frame and reports when it is unavailable. Export waits for complete deterministic evaluation. Ambo uses the same frame/render/output interfaces with presentation timing and reliable slide/video transitions. External feeds and native capture devices continue through the existing mediaEngine adapters.

**Acceleration.** Select paths by actual codec/API/device capabilities and measured behavior, not vendor-name guesses. Keep CPU/WASM fallback paths for supported work. Offload segmentation, tracking, denoising or enhancement to GPU/NPU only where a supported backend exists; keep inference asynchronous with cached results so it cannot block the audio callback or base video decode. NPU support is not a requirement for ordinary playback correctness.

## Migration and acceptance gates

1. Capture the failing Temudune workload with per-source decode state, buffered ranges, presentation timestamps, dropped frames, clock drift, source/proxy identity and resource pressure. Repeat cold/warm opens and randomized seek/play sequences. The exact project has not yet been reproduced in this session.
2. Deliver one vertical slice: local file → indexed decode → bounded frame queue → Pixels composition → audio-synchronized Fabula viewer. Keep the old path selectable during comparison. Demonstrate correct cuts, seeks, source exhaustion and recovery before migrating products.
3. Move audio context ownership and buses first, then reuse Melos DSP/instruments. Test simultaneous consumers, product teardown, device changes, cancellation, mute/solo and offline parity.
4. Migrate Pixels, Ambo, live output and export to the same frame contract, with their distinct timing policies. Add floating-point/color-managed paths behind capability checks and numerical reference tests.
5. Run sustained memory and frame-time tests on Intel integrated graphics, AMD and Nvidia, and ARM64/Qualcomm devices. Record resolution, codec, frame rate, effects stack, browser, power state and output display. Define supported real-time profiles from measurements.

Required correctness tests include NTSC and fractional cut boundaries, VFR/B-frame sources, rapid seeks, simultaneous audio tracks, long GOP media, source changes, context loss, local/cloud/proxy selection, and generation cancellation. Color acceptance includes range/transfer/primaries charts, saturated/highlight ramps, alpha blending and preview/export comparisons against reference values. Performance acceptance includes p50/p95/p99 seek latency, missed presentation deadlines, audio underruns and bounded memory during long sessions. “Best ever” is not an acceptance criterion; measured correctness and supported performance profiles are.

## Standards checked

- [W3C WebCodecs](https://www.w3.org/TR/webcodecs/): timestamped frames and color metadata; hardware acceleration is a hint, not a guarantee. Demux/indexing and scheduling remain application responsibilities.
- [W3C WebGPU](https://www.w3.org/TR/2026/CRD-webgpu-20260812/): GPU resource/format and canvas color/tone-mapping contracts. Browser/device/display support must still be tested.
