# Windows Native Acceleration Roadmap

## Current foundation

- WinUI 3 + WebView2 shell loads the live Plajah site.
- WebView2 requests the high-performance GPU and accelerated Chromium media paths.
- WebGL/WebGPU surfaces already request `high-performance` and use GPU compositing.
- Windows Hello capability checking and biometric/PIN verification are exposed through the native bridge.
- Firebase remains the account authority; Windows Hello is a local session-unlock factor, not a replacement identity provider.

## Delivery order

### 1. Measure the selected hardware

- Add a Windows diagnostics panel showing WebGPU adapter vendor, architecture, device, driver, backend, and limits.
- Report WebGL renderer and WebCodecs encode/decode support.
- Record whether the active adapter is NVIDIA RTX, Intel Arc, or another GPU.
- Add a copyable diagnostics report for support and performance tests.

### 2. Make media acceleration observable

- Add a WebCodecs capability probe for H.264, HEVC, AV1, and VP9 decode/encode.
- Prefer hardware-backed WebCodecs profiles when available; retain software fallback.
- Add frame-drop, encode latency, GPU memory, and thermal/performance counters to the live and Fabula diagnostics surfaces.
- Validate preview/export parity and long-session memory bounds on RTX and Arc test machines.

### 3. Native render path

- Add a native render job contract between Fabula and WinUI.
- Use Media Foundation and hardware MFTs first for H.264/HEVC/AV1.
- Keep an FFmpeg fallback for unsupported codecs and formats.
- Route export jobs by measured adapter and codec support, never by GPU brand alone.

### 4. Local AI on Windows

- Use ONNX Runtime with DirectML as the baseline provider for NVIDIA, Intel, and AMD.
- Add CUDA and TensorRT providers only as optional NVIDIA accelerators when their native runtime packages are present and compatible.
- Add DirectML/NPU provider probing and model-specific provider selection.
- Start with quantized Phi-4-mini/Qwen models; add Whisper/Moonshine ASR and Kokoro/Piper TTS for offline media workflows.
- Show model, provider, device, VRAM estimate, token latency, and fallback reason in Aria settings.
- Treat fine-tuning as an offline job: LoRA/QLoRA adapter training on RTX, with DirectML or CUDA/TensorRT where supported, and export a portable ONNX adapter/model for inference.

### 5. Native project and media storage

- Bridge project folders through WinUI file pickers and Storage APIs.
- Make disk-backed project media the source of truth; use OPFS/IndexedDB as cache layers.
- Add file watchers, relink tools, permissions, and safe project migration.

### 6. Native Windows experience

- Complete Windows Hello session unlock and account re-authentication UX.
- Add Jump List actions, toast deep links, media transport controls, file associations, and protocol activation.
- Add window restore, multi-window project surfaces, drag/drop, clipboard, and system share integration.
- Add optional startup/background render service only after explicit user consent.

### 7. Validation and release

- Maintain RTX, Intel Arc, integrated Intel, and CPU-only profiles.
- Run a fixed media corpus through decode, preview, capture, and export acceptance tests.
- Publish unsigned developer MSIX and signed Store/enterprise packages separately.
- Never claim NVIDIA acceleration without a measured adapter/provider result.

## Hardware policy

NVIDIA RTX is the preferred high-performance adapter when Windows exposes it, but Intel Arc remains a first-class path. DirectML and WebGPU are the portability baseline; CUDA, TensorRT, NVENC, and NVIDIA-specific runtimes are optional accelerators selected only after capability probing.
