# Windows Professional Media Stack

This is the dedicated Windows implementation plan for Fabula, Melos, Pixels, Live, and Crossover.
The WinUI shell is the host; the shared React engines remain the UI and portable fallback.

## Native layers

### Capture and routing

- Rust `plajah-media-engine` core with one clocked graph.
- GStreamer or Media Foundation source adapters behind the existing `services/mediaEngine/bridge.ts` contract.
- Blackmagic Desktop Video SDK adapters:
  - DeckLink video/audio input and output.
  - Hardware reference/genlock and house-format conversion.
  - BRAW decode for Fabula ingest and Pixels sources.
- NDI 6 SDK adapters:
  - sender discovery and receiver input;
  - NDI output, metadata/tally, and low-latency preview;
  - source clock and jitter reporting.
- SRT, RTMP, WebRTC, and UVC remain native source adapters with browser-compatible WHEP fallback.

### Low-latency audio for Melos and Fabula

- WASAPI shared mode as the default safe path.
- WASAPI exclusive mode for a user-selected low-latency device.
- ASIO adapter for professional interfaces, with explicit device ownership and sample-rate negotiation.
- One native audio clock per session; Melos, Fabula, Pixels, and Live attach buses instead of opening competing devices.
- 48 kHz project default, explicit 44.1/48/96 kHz conversion, bounded ring buffers, underrun counters, and drift correction.
- MIDI 2.0/WinMM/WinRT MIDI discovery bridge for Melos controllers and Pixels control surfaces.
- Browser Web Audio remains the fallback when no native audio engine is available.

### Steinberg VST3

- The WinUI shell now persists user VST3 directories and scans the standard
  `Common Files\VST3` locations plus custom folders.
- Melos and Fabula share the bridge functions `listWindowsVstDirectories`,
  `addWindowsVstDirectory`, `removeWindowsVstDirectory`, and `scanWindowsVst3`.
- Discovery is intentionally separate from execution. Third-party VST3 code must
  run in a supervised native audio process with a crash boundary, sample-rate/block-size
  negotiation, MIDI/event queues, parameter automation, state save/restore, and a
  plugin UI embedding policy.
- The host should use Steinberg's VST3 SDK under its license, prefer out-of-process
  hosting for untrusted plugins, and never load VST3 DLLs inside WebView2.
- Native plugin audio then returns to the shared Melos/Fabula graph through the same
  WASAPI/ASIO device clock, while browser sessions continue using the built-in DSP catalog.

### GPU and export

- D3D11/D3D12 texture sharing from the native graph into WebView2/Pixels.
- WebGPU compositor for Fabula grade/FX preview and Pixels scenes.
- Media Foundation hardware MFT selection first; FFmpeg fallback second.
- NVIDIA RTX: NVENC/NVDEC and optional CUDA/TensorRT providers after runtime probing.
- Intel Arc: Intel Quick Sync/oneVPL and DirectML providers after runtime probing.
- DirectML is the cross-vendor local-AI baseline; no feature is considered available until the provider reports a usable device.
- Keep frame timestamps, color metadata, HDR mode, and alpha semantics intact across native/browser boundaries.

## Product integration

### Fabula

- Native DeckLink/NDI/BRAW media pool sources.
- GPU-backed timeline monitor with WebGPU fallback and worker/WebCodecs decode path.
- Native render queue with Media Foundation/NVENC/QSV export and FFmpeg fallback.
- Audio page attaches to the native low-latency graph for monitoring, meters, stems, and capture.
- Hardware reference/house clock feeds frame-accurate playback and export.
- Keep the existing Pixels effect registry, node graph, grade model, and offline renderer as the portable ABI.

### Melos

- Native WASAPI exclusive/ASIO device selection and persistent session routing.
- Dedicated real-time audio thread outside WebView2; UI communicates through bounded command/event queues.
- MIDI and control-surface bridge with timestamped events.
- GPU spectral displays, waveform rendering, convolution, and local instrument/FX acceleration where WebGPU or DirectML is suitable.
- Native bounce/export for long sessions without blocking the UI.

### Pixels

- Native capture/output nodes for DeckLink, NDI, screen capture, camera, and program output.
- Zero-copy D3D texture path into the existing GPU compositor.
- Native recording and streaming outputs with NVENC/QSV/Media Foundation selection.
- Preserve the existing GLSL/WebGPU effect registry and deterministic offline renderer.
- Add native shader diagnostics, GPU timing, dropped-frame counters, and capture-stream health.

### Crossover

- Route Windows-local jobs to the native engine when the source is local and a provider is available.
- Keep cloud Crossover for heavy ML, unavailable codecs, and collaboration jobs.
- Reuse the existing `HW_ENCODER` catalog, adding measured provider availability rather than assuming `nvenc` or `qsv`.
- Add BRAW/RED/ARRIRAW native decode jobs behind installed vendor SDK detection.

## Capability contract

The web UI must receive a truthful report before enabling a professional control:

```ts
{
  host: 'winui',
  gpu: { vendor, device, driver, backend, vramBytes },
  video: { decklink, ndi, braw, nvenc, qsv, nvdec, webcodecs },
  audio: { wasapi, wasapiExclusive, asio, sampleRates, midi },
  ai: { directml, cuda, tensorrt, npu, providers },
  clock: { ptp, hardwareReference, masterClock }
}
```

The current WinUI shell reports conservative browser-compatible capabilities. The next native slice is the Rust/GStreamer host implementing `capabilities`, `list_sources`, `connect_source`, `route`, `set_program`, and `set_sync` from `NATIVE_MEDIA_ENGINE.md`.

## Acceptance gates

- No DeckLink/NDI/ASIO claim without a real device enumeration result.
- No RTX/Arc claim without measured adapter/provider data.
- Preview and export agree on color, timestamps, alpha, and audio sync.
- Audio underruns, dropped frames, queue depth, encode latency, and clock drift are visible.
- Every native feature has a browser/cloud fallback or an explicit unavailable state.
- Vendor SDK and codec redistribution licenses are cleared before commercial packaging.
