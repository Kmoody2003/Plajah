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
export interface FluxAudio {
  bass: number; mid: number; treble: number; level: number; beat: number;
  bpm?: number; tempoConfidence?: number; beatPosition?: number;
  /** Harmonic/formant-based vocal estimate, not a separated vocal stem. */
  voice?: number;
  intensity?: number;
  /** Sixteen logarithmic frequency regions, 30 Hz–16 kHz, when FFT data is available. */
  spectrum?: readonly number[];
  /** Spectral harmonic concentration and circular pitch-class color; estimates, not stems. */
  harmony?: number;
  harmonicHue?: number;
}
export const SILENT_AUDIO: FluxAudio = { bass: 0, mid: 0, treble: 0, level: 0, beat: 0 };

import { FLUX_MATH_SCENES, type FluxMathSceneId } from './fluxMathCatalog';
export type FluxSceneId = FluxMathSceneId | 'math-morph' | 'field' | 'tapestry' | 'tapestry-ii' | 'lattice' | 'tunnel' | 'aurora' | 'sanctum' | 'porcelain-tide' | 'velvet-bloom' | 'prism-archive' | 'deco-morph' | 'egypt-temple' | 'venetian-maiolica' | 'hellenic-marble' | 'japanese-ink' | 'african-bogolan';

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
  ...FLUX_MATH_SCENES.map(s => ({ ...s, cat: 'Mathematics', built: true })),
  { id: 'math-morph', name: 'Mathematical Odyssey', cat: 'Mathematics', built: true,
    line: 'A continuous journey through twelve mathematical worlds. Mids conduct the morphs; bass and voices reshape the geometry.' },
  { id: 'field', name: 'Flux Field', cat: 'Form', built: true,
    line: 'A structured dot-grid terrain that flows as one fractal surface — swells with the bass, erupts on the build, ripples on every kick.' },
  { id: 'tapestry', name: 'Deco Tapestry', cat: 'Deco', built: true,
    line: 'An embroidered Art Deco tapestry on a marble gallery wall whose gilt motifs shape-shift, kaleidoscope and brighten to the music. A static shot.' },
  { id: 'tapestry-ii', name: 'Deco Tapestry II', cat: 'Deco', built: true,
    line: 'Twenty-four brass-and-enamel Deco arrangements. Quiet music drifts through fine ornament; energy jumps accelerate radical morphs, reorientation and intricate woven patterns.' },
  { id: 'deco-morph', name: 'Deco Geometry Morph', cat: 'Deco', built: true,
    line: 'Volumetric 3D geometric morph matrix across authentic Art Deco pattern motifs. Music directly conducts physical vertex extrusion, origami folds, vortex torque, and seamless clip-to-clip geometry transitions.' },
  { id: 'venetian-maiolica', name: 'Venetian Maiolica', cat: 'Culture', built: true,
    line: 'A cobalt maiolica plate under studio light. Liquid gold swirls, bursts into spokes, webs into kintsugi veins and scrolls into filigree; on the drop the plate shatters and reassembles.' },
  { id: 'hellenic-marble', name: 'Hellenic Marble', cat: 'Culture', built: true,
    line: 'A veined marble wall where gold Greek-key meanders draw themselves outward, laurel wreaths sweep round, a gold inlay network spreads, a medallion rises and a temple front of ionic columns lifts into place.' },
  { id: 'japanese-ink', name: 'Japanese Ink', cat: 'Culture', built: true,
    line: 'Sumi ink blooms across washi paper: brush strokes sweep, seigaiha waves and asanoha stars bleed up through the fibres, ink drops ripple and swirl like ink in water.' },
  { id: 'african-bogolan', name: 'African Bogolan', cat: 'Culture', built: true,
    line: 'Mud-cloth in rust, ochre, black and cream: woven panels slide like a loom, mandalas assemble, stripes scroll against each other, triangles shatter and the cloth bursts radially on the drop.' },
  { id: 'egypt-temple', name: 'Egyptian Temple', cat: 'Culture', built: true,
    line: 'A carved sandstone wall of hieroglyphs under a raking light. Kicks push the blocks out, voices trace the glyphs in gold, snares ring out light, obelisks rise and the Eye of Horus ignites.' },
  { id: 'lattice', name: 'Flux Lattice', cat: 'Form', built: true,
    line: 'A suspended porcelain-and-copper orbital instrument. Interlaced meridians turn around a dark pearl; sound illuminates their intersections.' },
  { id: 'tunnel', name: 'Flux Tunnel', cat: 'Mir', built: true,
    line: 'A procession of monumental vermilion portals over an ink-blue causeway. The clock carries you forward; sound lights the ribs.' },
  { id: 'aurora', name: 'Flux Aurora', cat: 'Mir', built: true,
    line: 'Pleated jade and violet light suspended above a black arctic horizon. Slow overlapping curtains, fine spectral threads and a distant moon.' },
  { id: 'sanctum', name: 'The Sanctum', cat: 'Sanctuary', built: true,
    line: 'A monumental neoclassical cloister rendered in fluted marble, bronze coffering, and sacred geometry under an oculus. A tranquil, fixed architectural sanctuary.' },
  { id: 'porcelain-tide', name: 'Porcelain Tide', cat: 'Sculpture', built: true,
    line: 'A ceramic sea above a museum basin. Bass raises its crests, mids fold the porcelain scales, and treble exposes their copper undersides.' },
  { id: 'velvet-bloom', name: 'Velvet Bloom', cat: 'Couture', built: true,
    line: 'An impossible crimson couture sculpture. Bass opens the pleated petals, voices torque the folds, and high frequencies ignite the silk edges.' },
  { id: 'prism-archive', name: 'Prism Archive', cat: 'Optics', built: true,
    line: 'Suspended dichroic pages over an ink-black plinth. Bass fans the archive open, mids turn its glass leaves, and treble draws spectral light across the floor.' },
];

export function fluxSceneInfo(id: FluxSceneId): FluxSceneInfo | undefined {
  return FLUX_SCENES.find(s => s.id === id);
}
export function fluxSceneBuilt(id: FluxSceneId): boolean {
  return !!fluxSceneInfo(id)?.built;
}

export interface FluxSpec {
  /** -1 lets the music conduct; 0..23 holds a Deco arrangement for exploration. */
  decoSeed?: number;
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
  /** Render tier. 'ultra' opts into the expensive photoreal variants (Deco: PBR gold, soft shadows, AO, 2× rays). */
  quality?: 'standard' | 'ultra';
}

export const FLUX_DEFAULT: FluxSpec = {
  decoSeed: -1,
  scene: 'field',
  // yaw/pitch are OFFSETS on top of each scene's own framing (0 = the scene's default camera).
  camera: 'static', orbitSpeed: 6, yaw: 0, pitch: 0, distance: 1,
  exposure: 1.0, bloom: 1.0, hue: 0.5, sensitivity: 1.0,
  background: '#04060a',
};

const RANGES: Partial<Record<keyof FluxSpec, [number, number]>> = {
  decoSeed: [-1,23],
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

/** Perceptual bands from a byte FFT array (analyser or offline spectrum).
 * Pass the analyser's sample rate so bass/mid/treble represent physical Hz. */
export function fluxBandsFromFreq(freq: Uint8Array | null | undefined, sampleRate = 48000): FluxAudio {
  const n = freq ? freq.length : 0;
  if (!n) return { ...SILENT_AUDIO };
  const rate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 48000;
  // Physical bands + RMS/peak blend. A kick occupies only a few bins: averaging
  // it over the old 0–960 Hz bucket made actual music far weaker than demo values.
  const band = (low: number, high: number) => {
    const lo = Math.min(n - 1, Math.max(0, Math.floor(low / (rate / 2) * n)));
    const hi = Math.min(n, Math.max(lo + 1, Math.ceil(high / (rate / 2) * n)));
    let sum = 0, peak = 0;
    for (let i = lo; i < hi; i++) { const v = freq![i] / 255; sum += v * v; peak = Math.max(peak, v); }
    return Math.max(0, Math.min(1, (Math.sqrt(sum / (hi - lo)) * .8 + peak * .2 - .04) * 1.9));
  };
  const bass = band(30, 250), mid = band(250, 2400), treble = band(2400, 12000);
  return { bass, mid, treble, level: bass * .5 + mid * .35 + treble * .15, beat: 0 };
}

export interface FluxDriven { bass: number; mid: number; tre: number; kick: number; kickOnset?: number; snare: number; energy: number; beat: number; bpm:number; tempoConfidence:number; beatPosition?:number; voice:number; intensity:number; harmony?:number; harmonicHue?:number; spectrum?: readonly number[]; spectralImpulse?: readonly number[] }
export interface FluxAudioState { lastT: number; energy: number; kick: number; kickOnset?: number; prevKickBass?: number; snare: number; prevTre: number; bass: number; mid: number; tre: number; voice:number; intensity:number; spectrum?: number[]; spectralImpulse?: number[]; prevSpectrum?: number[] }
export function newFluxAudioState(): FluxAudioState {
  return { lastT: -1, energy: 0, kick: 0, snare: 0, prevTre: 0, bass: 0, mid: 0, tre: 0, voice:0, intensity:0 };
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
  // A transient impulse separate from the legacy sustained-bass kick envelope.
  const kickAttack=Math.max(clamp(a.beat,0,1),Math.max(0,bass-(st.prevKickBass??bass)-.045)*5);
  st.kickOnset=snap?clamp(a.beat,0,1):Math.max((st.kickOnset??0)*Math.exp(-dt/.14),Math.min(1,kickAttack));
  st.prevKickBass=bass;
  st.kick = snap ? kf : Math.max(st.kick * Math.pow(0.80, dtN), Math.min(1, kf));
  const sf = Math.max(0, tre - st.prevTre * 1.25); st.prevTre = st.prevTre * 0.9 + tre * 0.1;
  st.snare = snap ? 0 : Math.max(st.snare * Math.pow(0.78, dtN), Math.min(1, sf * 6.0));
  const voice=clamp(Number.isFinite(a.voice)?a.voice!:0,0,1);
  const intensity=clamp((Number.isFinite(a.intensity)?a.intensity!:a.level)*sens,0,1);
  st.voice=snap?voice:L(st.voice,voice,.075);st.intensity=snap?intensity:L(st.intensity,intensity,.06);
  st.spectrum ??= Array(16).fill(0); st.spectralImpulse ??= Array(16).fill(0); st.prevSpectrum ??= Array(16).fill(0);
  for(let i=0;i<16;i++){
    const raw=a.spectrum?.[i] ?? (i<5?a.bass:i<11?a.mid:a.treble);
    const value=clamp(Number.isFinite(raw)?raw*sens:0,0,1.4);
    const onset=Math.max(0,value-st.prevSpectrum[i]);
    st.spectrum[i]=snap?value:L(st.spectrum[i],value,value>st.spectrum[i]?.48:.14);
    st.spectralImpulse[i]=snap?0:Math.max(st.spectralImpulse[i]*Math.exp(-dt/.18),Math.min(1.4,onset*3));
    st.prevSpectrum[i]=value;
  }
  return { bass: st.bass, mid: st.mid, tre: st.tre, kick: st.kick, kickOnset:st.kickOnset, snare: st.snare, energy: st.energy, beat: st.kick,
    voice:st.voice,intensity:st.intensity,bpm:clamp(a.bpm||120,40,240),tempoConfidence:clamp(a.tempoConfidence||0,0,1),
    beatPosition:Number.isFinite(a.beatPosition)?a.beatPosition:undefined, spectrum:st.spectrum, spectralImpulse:st.spectralImpulse,
    harmony:clamp(Number.isFinite(a.harmony)?a.harmony!:0,0,1),harmonicHue:clamp(Number.isFinite(a.harmonicHue)?a.harmonicHue!:0,0,1) };
}
