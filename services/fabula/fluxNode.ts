// fluxNode — the data model and deterministic math for the Flux visual generators.
//
// Flux is the missing runtime the FX suite only ever spec'd: a REAL 3D, audio-reactive generator in
// the Trapcode Form / Mir lineage — flowing point-grids and fractal meshes, not a flat fullscreen
// fragment shader. Like model3dNode, this is the pure half: the spec, its defaults, the scene
// catalog, and the deterministic camera + audio-envelope math. The three.js renderer lives in
// components/plajahPixels/engine/core/flux.ts and consumes these numbers, so the same clip-local
// time produces the same picture in the live monitor and the offline export — the deliberate reason
// both bridge through a canvas the compositor uploads as a layer element.
//
// PURE: no three.js, no DOM. Reused by Fabula (a clip source, like model3d), the Pixels studio
// (a scene), and the DJ console (a program-out visual).

/** Audio bands driving a Flux scene. Matches the engine's AudioBands so any surface can feed it. */
export interface FluxAudio { bass: number; mid: number; treble: number; level: number; beat: number }
export const SILENT_AUDIO: FluxAudio = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 };

export type FluxSceneId = 'field' | 'lattice' | 'tunnel' | 'aurora';

export interface FluxSceneInfo {
  id: FluxSceneId;
  name: string;
  cat: string;
  line: string;
  /** Whether the scene has a runtime in flux.ts yet (catalog can list scenes ahead of the build). */
  built: boolean;
}

/** The Flux scene catalog. UIs enumerate this; only `built` scenes render. */
export const FLUX_SCENES: FluxSceneInfo[] = [
  { id: 'field', name: 'Flux Field', cat: 'Form', built: true,
    line: 'A structured dot-grid terrain that flows as one fractal surface — swells with the bass, erupts on the build, ripples on every kick.' },
  { id: 'lattice', name: 'Flux Lattice', cat: 'Form', built: false,
    line: 'A breathing fractal sphere-lattice that folds and shatters to the beat.' },
  { id: 'tunnel', name: 'Flux Tunnel', cat: 'Mir', built: false,
    line: 'An endless flown corridor of light that accelerates and warps with energy.' },
  { id: 'aurora', name: 'Flux Aurora', cat: 'Mir', built: false,
    line: 'Layered light curtains that sway and ignite across the frequency spectrum.' },
];

export function fluxSceneInfo(id: FluxSceneId): FluxSceneInfo | undefined {
  return FLUX_SCENES.find(s => s.id === id);
}
export function fluxSceneBuilt(id: FluxSceneId): boolean {
  return !!fluxSceneInfo(id)?.built;
}

export interface FluxSpec {
  scene: FluxSceneId;
  /** Camera behaviour. 'static' holds a fixed angle; 'orbit' auto-orbits by orbitSpeed over clip time. */
  camera: 'static' | 'orbit';
  orbitSpeed: number;   // deg/sec (auto orbit)
  yaw: number;          // base yaw, degrees (static, or orbit start)
  pitch: number;        // base pitch, degrees
  distance: number;     // camera distance as a MULTIPLE of the scene's framed distance (1 = default)
  exposure: number;     // tone-map exposure
  bloom: number;        // bloom strength multiplier (1 = default)
  hue: number;          // 0..1 palette rotation
  sensitivity: number;  // audio drive multiplier
  background: string;    // solid colour behind the scene
}

export const FLUX_DEFAULT: FluxSpec = {
  scene: 'field',
  camera: 'static', orbitSpeed: 6, yaw: 0, pitch: 16, distance: 1,
  exposure: 1.0, bloom: 1.0, hue: 0.5, sensitivity: 1.0,
  background: '#04060a',
};

const RANGES: Partial<Record<keyof FluxSpec, [number, number]>> = {
  orbitSpeed: [-90, 90], yaw: [-360, 360], pitch: [-80, 80], distance: [0.4, 3],
  exposure: [0.2, 3], bloom: [0, 3], hue: [0, 1], sensitivity: [0.2, 3],
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const DEG = Math.PI / 180;

/** A spec with every numeric field clamped and missing fields defaulted; scene coerced to a known id. */
export function normalizeFluxSpec(spec: Partial<FluxSpec> | undefined): FluxSpec {
  const out: FluxSpec = { ...FLUX_DEFAULT, ...(spec || {}) };
  if (!FLUX_SCENES.some(s => s.id === out.scene)) out.scene = FLUX_DEFAULT.scene;
  if (out.camera !== 'orbit') out.camera = 'static';
  for (const [key, range] of Object.entries(RANGES) as [keyof FluxSpec, [number, number]][]) {
    const v = out[key];
    if (typeof v === 'number' && Number.isFinite(v)) (out as any)[key] = clamp(v, range[0], range[1]);
    else (out as any)[key] = FLUX_DEFAULT[key];
  }
  return out;
}

/** The yaw (degrees) to use at a clip-local time: auto-orbit advances deterministically from the clock. */
export function fluxYawAtTime(spec: FluxSpec, localT: number): number {
  return spec.camera === 'orbit' ? spec.yaw + spec.orbitSpeed * Math.max(0, localT) : spec.yaw;
}

/** A spherical camera eye around a target — yaw around world Y (0 looks down -Z), pitch tilts up (+). */
export function fluxOrbitEye(target: { x: number; y: number; z: number }, yawDeg: number, pitchDeg: number, distance: number) {
  const yaw = yawDeg * DEG, pitch = pitchDeg * DEG, cp = Math.cos(pitch);
  return {
    x: target.x + distance * cp * Math.sin(yaw),
    y: target.y + distance * Math.sin(pitch),
    z: target.z + distance * cp * Math.cos(yaw),
  };
}

// ── Audio driver ────────────────────────────────────────────────────────────────────────────────
// The hard-won reactivity, in ONE reusable place: a fast-attack / slow-release energy envelope plus
// kick and snare onset, derived from plain bands so any surface (Pixels, Fabula, DJ) drives Flux the
// same way. Stateful for smoothness; frame-rate-independent so a 30fps export and a 60fps monitor
// feel the same. A backward or large time jump (a timeline seek) snaps rather than smears.

/** Bands from a byte FFT array (analyser or offline spectrum), resolution-independent via fractional
 *  band edges — so a 256-bin DJ analyser and a 1024-bin export spectrum read the same. */
export function fluxBandsFromFreq(freq: Uint8Array | null | undefined): FluxAudio {
  const n = freq ? freq.length : 0;
  if (!n) return { ...SILENT_AUDIO };
  const avg = (a: number, b: number) => { let s = 0, c = 0; const lo = Math.floor(a), hi = Math.floor(b); for (let i = lo; i < hi && i < n; i++) { s += freq![i]; c++; } return c ? s / c / 255 : 0; };
  const bass = avg(0, n * 0.04), mid = avg(n * 0.04, n * 0.18), treble = avg(n * 0.18, n * 0.55);
  return { bass: Math.min(1, bass * 1.5), mid: Math.min(1, mid * 1.5), treble: Math.min(1, treble * 1.8), level: Math.min(1, (bass + mid + treble) / 2.2), beat: 0 };
}

export interface FluxDriven { bass: number; mid: number; tre: number; kick: number; snare: number; energy: number; beat: number }
export interface FluxAudioState { lastT: number; energy: number; kick: number; snare: number; prevTre: number; bass: number; mid: number; tre: number }
export function newFluxAudioState(): FluxAudioState {
  return { lastT: -1, energy: 0, kick: 0, snare: 0, prevTre: 0, bass: 0, mid: 0, tre: 0 };
}

/** Advance the envelope by one frame at clip-local time `t`, returning the driven values for uniforms. */
export function driveFluxAudio(st: FluxAudioState, a: FluxAudio, t: number, sens: number): FluxDriven {
  let dt = st.lastT < 0 ? 0.0167 : t - st.lastT;
  const snap = dt < 0 || dt > 0.2;        // seek / first frame → don't smear
  if (snap) dt = 0.0167;
  st.lastT = t;
  const dtN = Math.min(4, Math.max(0.2, dt / 0.0167));
  const bass = Math.min(1.4, a.bass * sens), mid = Math.min(1.4, a.mid * sens);
  const tre = Math.min(1.4, a.treble * sens), level = Math.min(1.4, a.level * sens);
  const L = (cur: number, tgt: number, k: number) => cur + (tgt - cur) * Math.min(1, k * dtN);
  st.bass = snap ? bass : L(st.bass, bass, 0.10);
  st.mid = snap ? mid : L(st.mid, mid, 0.08);
  st.tre = snap ? tre : L(st.tre, tre, 0.14);
  const eT = Math.min(1.3, (bass * 0.5 + mid * 0.45 + level * 0.5) * 1.2);
  st.energy = snap ? eT : (eT > st.energy ? st.energy + (eT - st.energy) * Math.min(1, 0.4 * dtN)
                                          : st.energy + (eT - st.energy) * Math.min(1, 0.09 * dtN));
  const kf = Math.max(a.beat, Math.max(0, bass - 0.55) * 1.6);
  st.kick = snap ? kf : Math.max(st.kick * Math.pow(0.80, dtN), Math.min(1, kf));
  const sf = Math.max(0, tre - st.prevTre * 1.25); st.prevTre = st.prevTre * 0.9 + tre * 0.1;
  st.snare = snap ? 0 : Math.max(st.snare * Math.pow(0.78, dtN), Math.min(1, sf * 6.0));
  return { bass: st.bass, mid: st.mid, tre: st.tre, kick: st.kick, snare: st.snare, energy: st.energy, beat: st.kick };
}
