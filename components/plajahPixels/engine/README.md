# Plajah Pixels — Engine

Audio-reactive VJ engine: real-time generative scenes driven by music, a
natural-language timeline, GPU shaders, and a keyable media layer.

The framework-agnostic core lives in `engine/`. React glue lives in
`components/StudioStage.tsx`. A fully wired, dependency-free reference UI is
`plajah-pixels-studio.html` at the repo root — open it in any browser to play
with every system immediately (no build step).

```
engine/
  params.ts                 VizParams, PALETTES, hex helpers, AudioBands
  audioEngine.ts            Web-Audio FFT → bass/mid/treble bands, beat + BPM,
                            file playback + a procedural "demo pulse"
  presets/
    canvasPresets.ts        7 Canvas2D scenes (decoupled via a DrawCtx):
                            Aurora Drift, Liquid Chrome, Bauhaus Pop,
                            Particle Nebula, Gravity Wells, Kinetic Mirror,
                            Ripple Field
  webgl/
    glRenderer.ts           WebGL2 fragment-shader scenes (Plasma Fluid,
                            Raymarch Field) sharing the audio-uniform contract
  timeline/
    types.ts                ParamDiff / Marker schema (the parser↔timeline contract)
    parser.ts               rule-based NL → ParamDiff (offline, instant)
    timeline.ts             Timeline: markers, evaluate(t), eased automation
    llm/localLLM.ts         on-device model adapter (Transformers.js, lazy),
                            same ParamDiff output, rule-based fallback
  matting/
    matteEngine.ts          media layer: luma/chroma key (offline) + AI matte
                            (MediaPipe selfie segmentation, lazy CDN)
```

## The four systems

**1 · Scenes (Canvas2D + WebGL).** Every scene reads the same `AudioBands`
(`bass/mid/treble/level/beat`) and `VizParams` (`speed/glow/trail/...`). Canvas
presets and GLSL presets are registered side-by-side; switching one swaps which
canvas layer is visible. Add a shader scene by appending a fragment string +
`GL_PRESETS` entry — no UI changes needed.

**2 · Natural-language timeline.** A marker is `{ time, label, diff }`. Drop a
marker at any point and type plain English — "drop hard, go violet, kinetic".
`parser.ts` turns that into a `ParamDiff`; `Timeline.evaluate(t)` applies the
active marker as the playhead passes it, and the render loop eases live params
toward the target so it feels like automation, not a cut. No keyframing.

**3 · On-device language model (optional upgrade).** `LocalLLM` implements the
same `InstructionParser` interface as the rule parser and returns the identical
`ParamDiff` JSON, so it's a drop-in. It lazy-loads a small instruct model
(default `Qwen2.5-0.5B`, ~q4) via Transformers.js — WebGPU when available,
WASM otherwise. If it can't load, the rule parser keeps working. Enable with
`npm i @huggingface/transformers`.

**4 · Matte / media layer.** Upload an image or video and key it to alpha:
`luma` (keep brights — ideal for light-on-black loops) and `chroma` (green
key) run fully offline on a downscaled work buffer; `ai` uses MediaPipe selfie
segmentation loaded from CDN and falls back to luma if offline. The keyed layer
composites on top and scales with the bass.

## Wiring it up

```tsx
import { AudioEngine } from './engine/audioEngine';
import StudioStage, { StudioAPI } from './components/StudioStage';

const audio = useRef(new AudioEngine()).current;
const apiRef = useRef<StudioAPI>();

<StudioStage audio={audio} onReady={(api) => (apiRef.current = api)} />

// transport
audio.toggle();
// scenes
apiRef.current!.setScene('plasma');
// timeline marker from the user's text box
const { timeline } = apiRef.current!;
timeline.add(audio.time(), { time: 0, label: text, diff: parseInstruction(text) });
// or one-tap show
apiRef.current!.buildAutopilot();
```

## Honest status

- Canvas scenes, WebGL scenes, rule-based timeline, luma/chroma matte:
  **working and verified** (headless Chromium, zero console errors).
- Raymarch scene is GPU-heavy by nature — smooth on real hardware, slow under
  software rendering.
- On-device LLM and AI matte are **architected and wired** but depend on the
  optional package / network + WebGPU at runtime; both degrade gracefully to
  the offline paths.

## How this is wired into the React app

The app (`App.tsx`) owns a single `AudioContext` / `AnalyserNode` / source.
Everything here shares it:

- `analysis.ts` reads that **existing** analyser (no second audio source). The
  standalone `audioEngine.ts` is the all-in-one alternative used by the
  dependency-free `plajah-pixels-studio.html` reference — the React app uses
  `analysis.ts` instead.
- Studio scenes are added to `VisualizerMode` and rendered by
  `components/StudioStage.tsx`; classic modes still render via
  `AudioVisualizer`. Both composite over the dual-layer background with
  `config.blendMode`, so backgrounds, lighting, text, captions, MIDI and the
  Gemini tools all keep working untouched.
- `components/SceneRail.tsx` picks any of the 22 scenes; `TimelineStrip.tsx`
  applies natural-language markers to the whole `VisualizationConfig` via
  `timeline/applyToConfig.ts`; `MatteLayer.tsx` + `MattePanel.tsx` drive the
  keyable media layer. The app's Color Palette editor feeds the studio scenes
  directly.
