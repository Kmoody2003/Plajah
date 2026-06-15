/**
 * MIDI & Audio Reactive Service — Plajah Pixels
 *
 * Supports Native Instruments:
 *   Maschine Studio  (primary VJ controller — full VJ preset wired here)
 *   Komplete Kontrol (S25/M25/A25 — keys + 8 endless knobs)
 *   Maschine Jam     (8×8 grid)
 *
 * Architecture:
 *   • MASCHINE_STUDIO_VJ_PRESET  — canonical pad + knob mapping for live VJ use.
 *   • DEFAULT_MAPPINGS           — CC table derived from preset knobs + Group B extras.
 *   • VJ_PAD_BY_NOTE             — O(1) lookup: MIDI note → PadMapping.
 *   • dispatchMidiEvent          — routes raw MIDI to typed CustomEvents so canvas
 *                                  layers can react at 60 fps without React re-renders.
 */

// ─── Core MIDI Types ──────────────────────────────────────────────────────────

export interface MidiEventData {
  status: number;
  channel: number;
  note: number;
  velocity: number;
  cc: number;
  value: number;
  timestamp: number;
  deviceName: string;
}

export type MidiMappingType = 'cc' | 'note';

export interface MidiMapping {
  parameter: string;
  type: MidiMappingType;
  ccOrNote: number;
  channel?: number;
  label: string;
  min: number;
  max: number;
  isInt?: boolean;
}

// ─── Pad Action Types ─────────────────────────────────────────────────────────

export type PadAction =
  | { type: 'mode';           mode: string }   // VisualizerMode string value
  | { type: 'scene';          scene: string }  // Studio engine scene key (aurora, plasma…)
  | { type: 'toggle';         key: string }    // Flip a boolean on VisualizationConfig
  | { type: 'palette_rotate' }                 // Cycle the active color palette
  | { type: 'milkdrop_toggle' }               // Toggle Butterchurn / Milkdrop engine
  | { type: 'milkdrop_next' }                 // Advance to next Milkdrop preset
  | { type: 'strobe' };                        // One-shot invert strobe flash

export interface PadMapping {
  note:   number;   // MIDI note number
  label:  string;   // Short display label (≤7 chars fits the pad button)
  color:  string;   // Hex accent color for pad glow / UI
  row:    number;   // 1 = bottom (closest to player), 4 = top
  col:    number;   // 1 = left, 4 = right
  action: PadAction;
}

export interface KnobMapping extends MidiMapping {
  knob:  number;   // 1–8, left to right on the hardware
  color: string;   // Hex accent for the knob ring in the UI
}

export interface MaschineVJPreset {
  name:        string;
  device:      string;
  version:     string;
  description: string;
  pads:        PadMapping[];
  knobs:       KnobMapping[];
}

// ─── Maschine Studio VJ Preset ────────────────────────────────────────────────
//
// Pad layout philosophy (standing at the controller during a live set):
//
//   ROW 4 (TOP)    ← least accessible; macro FX toggles (hit occasionally)
//   ROW 3          ← Studio engine WebGL scenes (heavy/cinematic)
//   ROW 2          ← Dynamic / abstract scene bank
//   ROW 1 (BOTTOM) ← Core scenes — muscle memory, safe fallbacks, hit constantly
//
// Knob philosophy (K1 = most performance-critical):
//   K1  Sensitivity    — the #1 dial; crank for drops, ease back for breakdowns
//   K2  Glow           — visual bloom/halo level
//   K3  Speed          — animation velocity
//   K4  Beat Pulse     — how hard the background pulses with the kick
//   K5  Layer Blend    — crossfade the second media overlay
//   K6  Lighting       — stage beam / spotlight intensity
//   K7  Blur           — soft-focus / motion-blur strength
//   K8  Particles      — emitter density

export const MASCHINE_STUDIO_VJ_PRESET: MaschineVJPreset = {
  name:    'Plajah VJ — Maschine Studio',
  device:  'Maschine Studio',
  version: '1.0.0',
  description:
    'Performance-optimized 4×4 pad + 8-knob layout for live AV sets. ' +
    'Bottom row = safe core scenes. Top row = macro FX toggles. ' +
    'Knobs cover the 8 most live-critical continuous parameters.',

  pads: [
    // ── Row 1 (bottom) — Core Scene Bank ─────────────────────────────────────
    { note: 60, label: 'SPECTR', color: '#8b5cf6', row: 1, col: 1, action: { type: 'mode',  mode: 'SPECTRUM'     } },
    { note: 61, label: 'WAVE',   color: '#6366f1', row: 1, col: 2, action: { type: 'mode',  mode: 'WAVEFORM'     } },
    { note: 62, label: 'PARTICL',color: '#0ea5e9', row: 1, col: 3, action: { type: 'mode',  mode: 'PARTICLES'    } },
    { note: 63, label: 'NEBULA', color: '#ec4899', row: 1, col: 4, action: { type: 'mode',  mode: 'NEBULA'       } },

    // ── Row 2 — Dynamic Scene Bank ────────────────────────────────────────────
    { note: 64, label: 'STORM',  color: '#f59e0b', row: 2, col: 1, action: { type: 'mode',  mode: 'STORM'        } },
    { note: 65, label: 'KALEID', color: '#10b981', row: 2, col: 2, action: { type: 'mode',  mode: 'KALEIDOSCOPE' } },
    { note: 66, label: 'VORTEX', color: '#f43f5e', row: 2, col: 3, action: { type: 'mode',  mode: 'VORTEX'       } },
    { note: 67, label: 'LIQUID', color: '#06b6d4', row: 2, col: 4, action: { type: 'mode',  mode: 'LIQUID'       } },

    // ── Row 3 — Studio Engine (WebGL) ─────────────────────────────────────────
    { note: 68, label: 'AURORA', color: '#a78bfa', row: 3, col: 1, action: { type: 'scene', scene: 'aurora'      } },
    { note: 69, label: 'PLASMA', color: '#f97316', row: 3, col: 2, action: { type: 'scene', scene: 'plasma'      } },
    { note: 70, label: 'GRAVTY', color: '#84cc16', row: 3, col: 3, action: { type: 'scene', scene: 'gravity'     } },
    { note: 71, label: 'KINTC',  color: '#e879f9', row: 3, col: 4, action: { type: 'scene', scene: 'kinetic'     } },

    // ── Row 4 (top) — Macro Toggles ───────────────────────────────────────────
    { note: 72, label: 'BASS↑',  color: '#ef4444', row: 4, col: 1, action: { type: 'toggle',         key: 'enableBassShake'   } },
    { note: 73, label: 'MILKDRP',color: '#c084fc', row: 4, col: 2, action: { type: 'milkdrop_toggle'                          } },
    { note: 74, label: 'GLITCH', color: '#22d3ee', row: 4, col: 3, action: { type: 'toggle',         key: 'enableGlitch'      } },
    { note: 75, label: 'PALET',  color: '#fbbf24', row: 4, col: 4, action: { type: 'palette_rotate'                           } },
  ],

  knobs: [
    { knob: 1, parameter: 'sensitivity',            type: 'cc', ccOrNote: 14, label: 'Sensitivity',  min: 0.1, max: 3.0,  color: '#8b5cf6' },
    { knob: 2, parameter: 'glowIntensity',          type: 'cc', ccOrNote: 15, label: 'Glow',         min: 0,   max: 30,   color: '#ec4899' },
    { knob: 3, parameter: 'speed',                  type: 'cc', ccOrNote: 16, label: 'Speed',        min: 0.1, max: 3.0,  color: '#06b6d4' },
    { knob: 4, parameter: 'backgroundPulseIntensity',type:'cc', ccOrNote: 17, label: 'Beat Pulse',   min: 0,   max: 1.0,  color: '#f59e0b' },
    { knob: 5, parameter: 'layer2Opacity',          type: 'cc', ccOrNote: 18, label: 'Layer Blend',  min: 0,   max: 1.0,  color: '#10b981' },
    { knob: 6, parameter: 'lightingIntensity',      type: 'cc', ccOrNote: 19, label: 'Lighting',     min: 0,   max: 2.0,  color: '#f97316' },
    { knob: 7, parameter: 'blurStrength',           type: 'cc', ccOrNote: 20, label: 'Blur',         min: 0.1, max: 2.0,  color: '#64748b' },
    { knob: 8, parameter: 'particleCount',          type: 'cc', ccOrNote: 21, label: 'Particles',    min: 10,  max: 300,  color: '#a78bfa', isInt: true },
  ],
};

// O(1) lookup: MIDI note → PadMapping (built once at module load)
export const VJ_PAD_BY_NOTE: Record<number, PadMapping> = Object.fromEntries(
  MASCHINE_STUDIO_VJ_PRESET.pads.map(p => [p.note, p]),
);

// ─── CC Mapping Table ─────────────────────────────────────────────────────────
// Primary 8 entries are derived from the VJ preset knobs so pad + CC stay in sync.
// Group B (CC 22–31) covers extra post-FX and particle params.

export const DEFAULT_MAPPINGS: Record<string, MidiMapping> = {
  // Group A — VJ Preset knobs (CC 14–21)
  ...Object.fromEntries(
    MASCHINE_STUDIO_VJ_PRESET.knobs.map(k => [
      k.parameter,
      { parameter: k.parameter, type: k.type, ccOrNote: k.ccOrNote, label: k.label, min: k.min, max: k.max, isInt: k.isInt },
    ]),
  ),

  // Group B — Extra params (CC 22–31)
  mosaicIntensity:    { parameter: 'mosaicIntensity',    type: 'cc', ccOrNote: 22, label: 'Mosaic Intensity',   min: 0,   max: 1.0 },
  sliceCount:         { parameter: 'sliceCount',         type: 'cc', ccOrNote: 23, label: 'Slice Count',        min: 2,   max: 24,  isInt: true },
  sliceRotation:      { parameter: 'sliceRotation',      type: 'cc', ccOrNote: 24, label: 'Slice Rotation',     min: 0,   max: 360, isInt: true },
  bassShakeIntensity: { parameter: 'bassShakeIntensity', type: 'cc', ccOrNote: 25, label: 'Bass Shock',         min: 0.1, max: 3.0 },
  lumBassBrightness:  { parameter: 'lumBassBrightness',  type: 'cc', ccOrNote: 26, label: 'Bass Lum Bright',    min: 0.1, max: 3.0 },
  lumMidColorCycle:   { parameter: 'lumMidColorCycle',   type: 'cc', ccOrNote: 27, label: 'Mid Color Cycle',    min: 0,   max: 1.0 },
  particleTurbulence: { parameter: 'particleTurbulence', type: 'cc', ccOrNote: 28, label: 'Particle Turb.',     min: 0,   max: 1.0 },
  particleLifespan:   { parameter: 'particleLifespan',   type: 'cc', ccOrNote: 29, label: 'Particle Lifespan',  min: 0.5, max: 5.0 },
  particleGlow:       { parameter: 'particleGlow',       type: 'cc', ccOrNote: 30, label: 'Particle Glow',      min: 0,   max: 30  },
  luminanceThreshold: { parameter: 'luminanceThreshold', type: 'cc', ccOrNote: 31, label: 'Lum. Threshold',     min: 0,   max: 1.0 },

  // Standard MIDI — always present
  volume:             { parameter: 'volume',             type: 'cc', ccOrNote: 7,  label: 'Master Volume',      min: 0,   max: 1.0 },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

export function scaleCCValue(val: number, mapping: MidiMapping): number {
  const scaled = mapping.min + (val / 127) * (mapping.max - mapping.min);
  return mapping.isInt ? Math.round(scaled) : parseFloat(scaled.toFixed(2));
}

export function rotatePalette(palette: string[]): string[] {
  if (palette.length <= 1) return palette;
  const copied = [...palette];
  const last = copied.pop()!;
  copied.unshift(last);
  return copied;
}

// ─── Device Detection ─────────────────────────────────────────────────────────

export type DetectedDeviceType = 'generic' | 'maschine_studio' | 'komplete_kontrol' | 'maschine_jam';

export function detectDeviceType(name: string): DetectedDeviceType {
  const n = name.toLowerCase();
  if (n.includes('maschine studio'))                              return 'maschine_studio';
  if (n.includes('komplete kontrol') || n.includes('komplete_kontrol')) return 'komplete_kontrol';
  if (n.includes('maschine jam'))                                 return 'maschine_jam';
  return 'generic';
}

// ─── Event Dispatch ───────────────────────────────────────────────────────────
// Fires CustomEvents on `window` so canvas layers can subscribe without React
// overhead (critical for 60-fps visual responsiveness).

export function dispatchMidiEvent(event: MidiEventData) {
  window.dispatchEvent(new CustomEvent('plajah-midi-raw', { detail: event }));

  const isNoteOn  = event.status >= 0x90 && event.status <= 0x9F && event.velocity > 0;
  const isNoteOff = (event.status >= 0x80 && event.status <= 0x8F)
                  || (event.status >= 0x90 && event.status <= 0x9F && event.velocity === 0);
  const isCC      = event.status >= 0xB0 && event.status <= 0xBF;

  if      (isNoteOn)  window.dispatchEvent(new CustomEvent('plajah-midi-note-on',  { detail: event }));
  else if (isNoteOff) window.dispatchEvent(new CustomEvent('plajah-midi-note-off', { detail: event }));
  else if (isCC)      window.dispatchEvent(new CustomEvent('plajah-midi-cc',       { detail: event }));
}
