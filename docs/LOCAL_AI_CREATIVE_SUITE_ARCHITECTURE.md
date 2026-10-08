# Plajah Native Creative Engine Architecture
### Fabula · Tela · 100% Native On-Device Generation · Zero External Vendors

## Executive Summary
This architecture provides a frictionless, zero-server-bill creative engine for **Fabula** (video, film, animatics) and **Tela** (canvas, comics, graphic novels, storybooks, vector art). It delivers high-end cinematic generation, micro-texture hallucination detail enhancement, 3D relighting, and sequential comics running **100% natively on the user's device** via Windows DirectML, NVIDIA TensorRT, and browser WebGPU.

**Zero Third-Party Vendor Reliance**: The creator does NOT install ComfyUI, configure Python environments, run local servers, or touch any external software. Plajah executes the neural models directly through its own native app runtime.

---

## 1. The Core Architectural Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CREATOR LAYER (Frictionless UI)                      │
│   • Tela Comic Studio: 6-Panel / Manga / Storybook Sequential Pages    │
│   • Fabula Creative Studio: Cinema Stills, Detail Enhancer, IC-Light   │
│   • 2D Vector Forge: Instant Bézier vectorization into TelaVector      │
│   • Character Bibles: Multi-angle turnaround and identity locks        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Directorial Intent (No Wires)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             PLAJAH NATIVE COMPILER (services/localAi/)                 │
│   • plajahPipelineEngine.ts: Compiles directorial intent to tensor DAG │
│   • plajahNativeRunner.ts: Dispatches directly to on-device GPU runtime│
│   • localEngineDiscovery.ts: Probes DirectML, TensorRT, and WebGPU     │
│   • telaVectorForge.ts: Raster to editable TelaVectorObjects           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Direct On-Device Execution (0 Cost)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│         PLAJAH ON-DEVICE RUNTIME (WinUI 3 DirectML / WebGPU)           │
│   • PlajahAiNativeService.cs: Windows DirectML & NVIDIA TensorRT       │
│   • On-Device Models: Stored natively in %LocalAppData%\Plajah\Models  │
│   [Cinematic Stills]       FLUX.1-schnell / dev (NF4/GGUF)             │
│   [Detail Enhancer]        SUPIR v0Q Micro-Texture Hallucinator        │
│   [3D Relighting]          IC-Light (Directional key & ambient swap)   │
│   [Cinematic Motion]       Wan 2.1 Video & LTX-Video                   │
│   [2D & Graphic Novels]    Animagine XL 3.1 & Illustrious-XL           │
│   [Vector Paths]           Wasm / WebGPU ImageTracer to SVG Béziers    │
│   [Character Continuity]   IP-Adapter FaceID / PuLID Embeddings        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The Four Pillars Built

### Pillar 1: Plajah Native Engine & DirectML / TensorRT Runtime
- **`services/localAi/localEngineDiscovery.ts`**: Automatically detects Plajah Native Engine on Windows and WebGPU in the browser. Zero configuration required from the user.
- **`services/localAi/plajahPipelineEngine.ts`**: Directorial intent compiler. Translates camera focal lengths (anamorphic, 35mm, 85mm), cinematic lighting (chiaroscuro, neon noir), hallucination sliders (0–100%), and 3D light angles into Plajah tensor execution plans.
- **`services/localAi/plajahNativeRunner.ts`**: Dispatches execution directly through Plajah's Windows WinUI 3 shell (`plajahMediaEngine.invokeNative('ai_diffuse')`) or browser WebGPU shaders without external servers.

### Pillar 2: The Plajah Native Creative Studio
- **`services/localAi/creativeStudioBridge.ts`**:
  - Automatically defaults to **0-credit on-device GPU execution** when local hardware is detected.
- **`components/fabula/LocalCreativeStudio.tsx`**:
  - **Cinematic Stills:** Panavision anamorphic lenses, 35mm grain, Chiaroscuro/Neon-noir lighting.
  - **Detail Enhancer & 4K Upscaler:** Dual-dial control (Hallucination/Creativity 0–100% and Resemblance/Fidelity 0–100%) across Photographic, Cinematic, Comic Ink, and Storybook engines.
  - **IC-Light 3D Relighting:** Interactive 3D spherical light bead controller (Azimuth & Elevation) with Kelvin temperature and ambient environment prompting.
  - **Cinema Motion:** Wan 2.1 text-to-video and image-to-video with camera motion trajectories (pan, push-in, orbit).

### Pillar 3: True Vector Art Forge in Tela
- **`services/localAi/telaVectorForge.ts`**:
  - Pairs flat 2D generation with Tela's built-in vector reconstruction engine (`services/telaImageTrace.ts`).
  - Emits native, fully editable `TelaVectorObject[]` with Bézier nodes (`TelaVectorNode`), closed paths, and grouped layers.
  - No blurry pixelation; directly scalable and printable on any Tela canvas frame.

### Pillar 4: Comics, Graphic Novels & Storybook Continuity
- **`services/story/characterBible.ts`**:
  - Manages Character Bibles with visual anchors and multi-angle turnarounds (front, 3/4, profile, close-up).
  - Employs IP-Adapter / FaceID embeddings to lock character likeness and style across every panel.
- **`components/tela/TelaComicStudio.tsx`**:
  - Multi-panel sequential story director with shot framing (establishing shot, medium, close-up, reaction).
  - Formats: 6-Panel American Comic Grid, 9-Panel Grid, Dynamic Manga Splash, Storybook Top-Half / Text-Bottom.
  - Live vector speech bubbles with automatic tail directional anchoring.
  - 1-click export into native Tela canvas frames.
