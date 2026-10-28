// MEKA Drum Synth — the parametric drum engines a pad can play instead of a sample, shaped like
// the drum synths in Maschine, Bitwig and Live so a kit built on them comes across as a SOUND
// (engine, model, tune, decay…) rather than an empty pad.
//
//   Engines: Kick · Snare · Hi-hat · Tom · Percussion · Clap. Each has a few models (different
//   synthesis), one shared parameter set in real units, and a page layout for the control area.
//   The DSP lives in engine/drumSynthVoice.ts; this file is pure (patches, defaults, translation).
//
// Translation tables map other hosts' drum synths onto these engines: Maschine's Drum Synths
// (engine + model names), Bitwig's E-Kick/E-Snare/E-Hat/E-Clap/E-Tom (device ids + parameter
// ids, read from the real Bitwig 5.1 device presets) and Live's DS Kick/DS Snare/… devices.

import type { SynthVoiceId } from './grooveDoc';

export type DrumEngine = 'kick' | 'snare' | 'hat' | 'tom' | 'perc' | 'clap';

export interface DrumSynthPatch {
  engine: DrumEngine;
  model: string;
  /** Parameter id → value in the parameter's own units (see PARAMS). Absent = default. */
  params: Record<string, number>;
  /** Where the patch was translated from ("Maschine Kick · Dusty"), shown in the slot. */
  from?: string;
}

export interface DrumParamDef {
  id: string;
  label: string;
  min: number;
  max: number;
  def: number;
  unit: 'st' | 's' | '%' | 'dB' | 'x' | 'Hz';
  log?: boolean;
}

export const ENGINE_LABEL: Record<DrumEngine, string> = {
  kick: 'Kick', snare: 'Snare', hat: 'Hi-hat', tom: 'Tom', perc: 'Percussion', clap: 'Clap',
};

/** Models per engine: id → label + one line on the sound. */
export const MODELS: Record<DrumEngine, { id: string; label: string; blurb: string }[]> = {
  kick: [
    { id: 'analog', label: 'Analog', blurb: 'Sine body with a pitch sweep and a beater click — the 808/909 family' },
    { id: 'sub', label: 'Sub', blurb: 'Clean, long sine for sub-bass kicks' },
    { id: 'dusty', label: 'Dusty', blurb: 'Saturated, rounded body with a soft noise tail — sampled-vinyl feel' },
    { id: 'fm', label: 'FM', blurb: 'Frequency-modulated body — grit, growl and rasp' },
    { id: 'acoustic', label: 'Acoustic', blurb: 'Membrane modes and a felt beater — a real bass drum' },
  ],
  snare: [
    { id: 'analog', label: 'Analog', blurb: 'Two tuned oscillators and filtered noise — 808/909 snares' },
    { id: 'acoustic', label: 'Acoustic', blurb: 'Shell modes, a stick crack and snare wires' },
    { id: 'bit', label: 'Bit', blurb: 'Crushed, digital — early sampler snares' },
    { id: 'metal', label: 'Metal', blurb: 'Ringing, inharmonic body — rims and metallic snares' },
  ],
  hat: [
    { id: 'metal', label: 'Metal', blurb: 'Six square oscillators at cymbal ratios — the 808 hat' },
    { id: 'noise', label: 'Noise', blurb: 'Filtered white noise — tight digital hats' },
    { id: 'hybrid', label: 'Hybrid', blurb: 'Metal tones and noise blended' },
  ],
  tom: [
    { id: 'analog', label: 'Analog', blurb: 'Sine with a pitch sweep — 808 toms' },
    { id: 'acoustic', label: 'Acoustic', blurb: 'Drumhead modes with a skin noise — floor and rack toms' },
    { id: 'fm', label: 'FM', blurb: 'FM body for synthetic, glassy toms' },
  ],
  perc: [
    { id: 'fm', label: 'FM', blurb: 'Two-operator FM — bells, blips, cowbells' },
    { id: 'membrane', label: 'Membrane', blurb: 'Inharmonic drumhead modes — congas, kettle and frame drums' },
    { id: 'shaker', label: 'Shaker', blurb: 'Grains of noise — shakers and maracas' },
  ],
  clap: [
    { id: 'analog', label: 'Analog', blurb: 'Several noise bursts and a tail — the 808/909 clap' },
    { id: 'room', label: 'Room', blurb: 'Looser bursts and a longer, diffuse tail' },
  ],
};

const P = (id: string, label: string, min: number, max: number, def: number, unit: DrumParamDef['unit'], log?: boolean): DrumParamDef => ({ id, label, min, max, def, unit, log });

/** Parameters per engine, in page order (two pages of up to six on screen, plus model/engine). */
export const PARAMS: Record<DrumEngine, DrumParamDef[]> = {
  kick: [
    P('tune', 'Tune', 25, 150, 50, 'Hz', true), P('decay', 'Decay', 0.05, 3, 0.45, 's', true),
    P('pitchAmt', 'Pitch', 0, 48, 24, 'st'), P('pitchDecay', 'Pitch Dec', 0.003, 0.4, 0.035, 's', true),
    P('click', 'Click', 0, 1, 0.35, '%'), P('drive', 'Drive', 0, 1, 0.1, '%'),
    P('tone', 'Tone', 0, 1, 0.5, '%'), P('noise', 'Noise', 0, 1, 0, '%'),
    P('fm', 'FM', 0, 1, 0.3, '%'), P('level', 'Level', -24, 6, 0, 'dB'),
  ],
  snare: [
    P('tune', 'Tune', 100, 500, 185, 'Hz', true), P('decay', 'Decay', 0.03, 1.5, 0.16, 's', true),
    P('noiseDecay', 'Noise Dec', 0.03, 1.5, 0.22, 's', true), P('mix', 'Snares', 0, 1, 0.6, '%'),
    P('tone', 'Tone', 0, 1, 0.55, '%'), P('snap', 'Snap', 0, 1, 0.4, '%'),
    P('pitchAmt', 'Pitch', 0, 24, 5, 'st'), P('detune', 'Body 2', 1.1, 2.5, 1.62, 'x'),
    P('drive', 'Drive', 0, 1, 0, '%'), P('level', 'Level', -24, 6, 0, 'dB'),
  ],
  hat: [
    P('tune', 'Tune', -24, 24, 0, 'st'), P('decay', 'Decay', 0.02, 2, 0.06, 's', true),
    P('tone', 'Tone', 0, 1, 0.6, '%'), P('ring', 'Ring', 0, 1, 0.4, '%'),
    P('mix', 'Noise', 0, 1, 0.4, '%'), P('attack', 'Attack', 0, 0.05, 0, 's'),
    P('level', 'Level', -24, 6, 0, 'dB'),
  ],
  tom: [
    P('tune', 'Tune', 50, 400, 120, 'Hz', true), P('decay', 'Decay', 0.05, 2, 0.4, 's', true),
    P('pitchAmt', 'Pitch', 0, 24, 7, 'st'), P('pitchDecay', 'Pitch Dec', 0.005, 0.5, 0.08, 's', true),
    P('noise', 'Skin', 0, 1, 0.2, '%'), P('tone', 'Tone', 0, 1, 0.5, '%'),
    P('fm', 'FM', 0, 1, 0.2, '%'), P('level', 'Level', -24, 6, 0, 'dB'),
  ],
  perc: [
    P('tune', 'Tune', 80, 3000, 400, 'Hz', true), P('decay', 'Decay', 0.02, 2, 0.25, 's', true),
    P('ratio', 'Ratio', 0.5, 8, 1.48, 'x'), P('fm', 'FM', 0, 1, 0.4, '%'),
    P('tone', 'Tone', 0, 1, 0.5, '%'), P('pitchAmt', 'Pitch', 0, 24, 3, 'st'),
    P('attack', 'Attack', 0, 0.08, 0, 's'), P('level', 'Level', -24, 6, 0, 'dB'),
  ],
  clap: [
    P('tune', 'Tone', 600, 4000, 1400, 'Hz', true), P('decay', 'Decay', 0.05, 1.5, 0.25, 's', true),
    P('spread', 'Spread', 0.004, 0.03, 0.011, 's'), P('bursts', 'Bursts', 1, 6, 3, 'x'),
    P('q', 'Width', 0, 1, 0.5, '%'), P('level', 'Level', -24, 6, 0, 'dB'),
  ],
};

export function paramDef(engine: DrumEngine, id: string): DrumParamDef | undefined {
  return PARAMS[engine].find((p) => p.id === id);
}

/** A parameter's value on a patch, defaulted and clamped. */
export function dsParam(p: DrumSynthPatch, id: string): number {
  const def = paramDef(p.engine, id);
  if (!def) return 0;
  const v = p.params[id];
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(def.max, Math.max(def.min, v)) : def.def;
}

export function newDrumSynth(engine: DrumEngine, model?: string, params: Record<string, number> = {}): DrumSynthPatch {
  const m = model && MODELS[engine].some((x) => x.id === model) ? model : MODELS[engine][0].id;
  return { engine, model: m, params: { ...params } };
}

/** The six built-in starter voices, as Drum Synth patches (so a default kit becomes editable). */
export function drumSynthFromLegacy(v: SynthVoiceId | undefined): DrumSynthPatch {
  switch (v) {
    case 'sub': return newDrumSynth('kick', 'sub', { tune: 52, decay: 1.2, pitchAmt: 9, pitchDecay: 0.06, click: 0 });
    case 'snare': return newDrumSynth('snare', 'analog');
    case 'clap': return newDrumSynth('clap', 'analog');
    case 'hat-closed': return newDrumSynth('hat', 'metal');
    case 'hat-open': return newDrumSynth('hat', 'metal', { decay: 0.42 });
    default: return newDrumSynth('kick', 'analog');
  }
}

/** Engine for a sound name ("Snare 2", "Open Hat", "Conga") — for synth pads made from names. */
export function engineForName(name: string): DrumEngine {
  const n = name.toLowerCase();
  if (/kick|bd\b|bass ?drum|808/.test(n)) return 'kick';
  if (/clap/.test(n)) return 'clap';
  if (/snare|sd\b|rim/.test(n)) return 'snare';
  if (/hat|hh\b|cymbal|ride|crash/.test(n)) return 'hat';
  if (/tom/.test(n)) return 'tom';
  return 'perc';
}

// ── Maschine Drum Synths ────────────────────────────────────────────────────
// Maschine's drum synth engines and their model names (as shown in the Maschine software), mapped
// to the nearest engine + model here. Parameter values inside a Maschine file aren't decoded —
// the model and the sound's own tuning come across; the rest starts from the model's defaults.

const NI_ENGINE: Record<string, DrumEngine> = { kick: 'kick', snare: 'snare', 'hi-hat': 'hat', hihat: 'hat', tom: 'tom', percussion: 'perc' };
const NI_MODEL: Record<DrumEngine, Record<string, string>> = {
  kick: { sub: 'sub', tronic: 'analog', bold: 'analog', push: 'analog', snappy: 'analog', dusty: 'dusty', grit: 'fm', rasper: 'fm', maple: 'acoustic' },
  snare: { volt: 'analog', pow: 'analog', vintage: 'analog', airy: 'acoustic', sharp: 'acoustic', iron: 'acoustic', breaker: 'acoustic', bit: 'bit', chrome: 'metal', clap: 'analog' },
  hat: { silver: 'metal', circuit: 'metal', memory: 'noise', hybrid: 'hybrid' },
  tom: { tronic: 'analog', high: 'analog', floor: 'acoustic', fractal: 'fm' },
  perc: { fractal: 'fm', kettle: 'membrane', shaker: 'shaker' },
  clap: {},
};

/** Translate a Maschine Drum Synth (engine name + model name) — null when it isn't one. */
export function fromMaschine(engineName: string, modelName: string): DrumSynthPatch | null {
  const engine = NI_ENGINE[engineName.toLowerCase().replace(/\s+/g, '')];
  if (!engine) return null;
  const m = modelName.toLowerCase();
  // Maschine's "Clap" is a Snare model; here it's its own engine.
  if (engine === 'snare' && m === 'clap') return { ...newDrumSynth('clap', 'analog'), from: 'Maschine Snare · Clap' };
  const model = NI_MODEL[engine][m];
  if (!model) return null;
  return { ...newDrumSynth(engine, model), from: `Maschine ${ENGINE_LABEL[engine]} · ${modelName}` };
}

/** Find Maschine Drum Synth engine/model pairs among a file's embedded strings, in order. */
export function maschineSynthsIn(strings: string[]): DrumSynthPatch[] {
  const out: DrumSynthPatch[] = [];
  for (let i = 0; i < strings.length; i++) {
    const eng = strings[i].trim();
    if (!NI_ENGINE[eng.toLowerCase().replace(/\s+/g, '')]) continue;
    // The model name follows its engine within a few strings.
    for (let j = i + 1; j < Math.min(strings.length, i + 4); j++) {
      const hit = fromMaschine(eng, strings[j].trim());
      if (hit) { out.push(hit); i = j; break; }
    }
  }
  return out;
}

// ── Bitwig E-drums ──────────────────────────────────────────────────────────
// Device ids and parameter ids are from Bitwig 5.1's own device presets. Values are doubles;
// Bitwig stores tuning as a MIDI note and times as log10(seconds).

export const BITWIG_DEVICES: Record<string, { name: string; engine: DrumEngine; model: string }> = {
  'c6d5de18-a6f1-4daa-90a9-d9254527601a': { name: 'E-Kick', engine: 'kick', model: 'analog' },
  'db22eb41-c8a0-4055-b617-637614dfa185': { name: 'E-Snare', engine: 'snare', model: 'analog' },
  '742e4a89-df78-4ca5-b6b0-ca78889d5953': { name: 'E-Hat', engine: 'hat', model: 'metal' },
  '89eba41d-46d3-4506-8ce6-ba9fe3e3bee4': { name: 'E-Clap', engine: 'clap', model: 'analog' },
};
const BITWIG_BY_NAME: Record<string, { engine: DrumEngine; model: string }> = {
  'E-Kick': { engine: 'kick', model: 'analog' }, 'E-Snare': { engine: 'snare', model: 'analog' }, 'E-Hat': { engine: 'hat', model: 'metal' },
  'E-Clap': { engine: 'clap', model: 'analog' }, 'E-Tom': { engine: 'tom', model: 'analog' }, 'E-Cowbell': { engine: 'perc', model: 'fm' },
};

const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const logSec = (v: number) => Math.pow(10, v);

/** Translate a Bitwig E-drum from its device name and the parameter values read out of the kit. */
export function fromBitwig(deviceName: string, values: Record<string, number>): DrumSynthPatch | null {
  const dev = BITWIG_BY_NAME[deviceName];
  if (!dev) return null;
  const p: Record<string, number> = {};
  const has = (k: string) => typeof values[k] === 'number' && Number.isFinite(values[k]);
  if (dev.engine === 'kick') {
    if (has('TUNING')) p.tune = midiHz(values.TUNING);
    if (has('DECAY')) p.decay = logSec(values.DECAY);
    if (has('PITCH_MOD_DECAY')) p.pitchDecay = logSec(values.PITCH_MOD_DECAY);
    if (has('PITCH_MOD_AMOUNT')) p.pitchAmt = values.PITCH_MOD_AMOUNT;
    if (has('ATTACK_CLICK')) p.click = values.ATTACK_CLICK ? 0.5 : 0;
    if (has('TONE')) p.tone = Math.min(1, Math.max(0, values.TONE / 100));
  } else if (dev.engine === 'snare') {
    if (has('OSC_1_TUNING')) p.tune = midiHz(values.OSC_1_TUNING);
    if (has('OSC_1_DECAY')) p.decay = logSec(values.OSC_1_DECAY);
    if (has('NOISE_DECAY')) p.noiseDecay = logSec(values.NOISE_DECAY);
    if (has('NOISE_MIX')) p.mix = Math.min(1, Math.max(0, values.NOISE_MIX > 1 ? values.NOISE_MIX / 100 : values.NOISE_MIX));
    if (has('OSC_2_TUNINGOFFSET')) p.detune = Math.pow(2, values.OSC_2_TUNINGOFFSET / 12);
  } else if (dev.engine === 'hat') {
    if (has('DECAY')) p.decay = logSec(values.DECAY);
    if (has('TONE')) p.tone = Math.min(1, Math.max(0, values.TONE > 1 ? values.TONE / 100 : values.TONE));
  } else if (dev.engine === 'clap') {
    if (has('DECAY')) p.decay = logSec(values.DECAY);
    if (has('FREQ')) p.tune = values.FREQ > 127 ? values.FREQ : midiHz(values.FREQ);
  }
  return { ...newDrumSynth(dev.engine, dev.model, p), from: `Bitwig ${deviceName}` };
}

/** Read every Bitwig E-drum in a .bwpreset, in order: device name + its parameter values. */
export function bitwigDrumsIn(b: Uint8Array): DrumSynthPatch[] {
  return bitwigDrumsAt(b).map((d) => d.patch);
}

/** Same, with the byte offset each device starts at (to interleave with sample pads). */
export function bitwigDrumsAt(b: Uint8Array): { at: number; patch: DrumSynthPatch }[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const dec = new TextDecoder();
  const out: { at: number; patch: DrumSynthPatch }[] = [];
  let current: { name: string; at: number; values: Record<string, number> } | null = null;
  const flush = () => { if (current) { const d = fromBitwig(current.name, current.values); if (d) out.push({ at: current.at, patch: d }); } current = null; };
  for (let i = 0; i + 5 < b.length; i++) {
    if (b[i] !== 0x08) continue;
    const len = v.getUint32(i + 1);
    if (len < 2 || len > 64 || i + 5 + len > b.length) continue;
    const s = dec.decode(b.subarray(i + 5, i + 5 + len));
    if (!/^[\w\- ]+$/.test(s)) continue;
    const end = i + 5 + len;
    if (BITWIG_BY_NAME[s]) {
      // The device name repeats in its header; only start a new drum when it changes.
      if (!current || current.name !== s || Object.keys(current.values).length) { flush(); current = { name: s, at: i, values: {} }; }
      i = end - 1; continue;
    }
    // A parameter id is followed by a 4-byte field id, a type byte, then the value.
    if (current && /^[A-Z0-9_]+$/.test(s) && end + 5 < b.length) {
      const type = b[end + 4];
      if (type === 0x07 && end + 13 <= b.length) current.values[s] = v.getFloat64(end + 5);
      else if (type === 0x05) current.values[s] = b[end + 5];
      i = end - 1;
    }
  }
  flush();
  return out;
}

// ── Ableton Live DS devices ─────────────────────────────────────────────────
// Live's Drum Synths are Max for Live devices named "DS Kick", "DS Snare"… inside Drum Rack
// chains; their parameters appear by name. Values are mapped where the meaning is plain.

const LIVE_DS: Record<string, { engine: DrumEngine; model: string }> = {
  'ds kick': { engine: 'kick', model: 'analog' }, 'ds snare': { engine: 'snare', model: 'analog' }, 'ds hh': { engine: 'hat', model: 'metal' },
  'ds tom': { engine: 'tom', model: 'analog' }, 'ds clap': { engine: 'clap', model: 'analog' }, 'ds cymbal': { engine: 'hat', model: 'hybrid' },
  'ds fm': { engine: 'perc', model: 'fm' }, 'ds clang': { engine: 'perc', model: 'fm' }, 'ds kick 2': { engine: 'kick', model: 'analog' },
};

export function fromLiveDs(deviceName: string, params: Record<string, number>): DrumSynthPatch | null {
  const key = deviceName.toLowerCase().replace(/\.amxd$/, '').trim();
  const dev = LIVE_DS[key];
  if (!dev) return null;
  const p: Record<string, number> = {};
  const get = (...names: string[]) => { for (const n of names) { const k = Object.keys(params).find((x) => x.toLowerCase() === n); if (k) return params[k]; } return undefined; };
  const pitch = get('pitch', 'tune');
  // Hats tune in semitones; the others in Hz (a small number there is a relative knob — skip it).
  if (pitch !== undefined && (dev.engine === 'hat' || pitch > 10)) p.tune = dev.engine === 'hat' ? Math.max(-24, Math.min(24, pitch)) : pitch;
  const decay = get('decay');
  if (decay !== undefined) p.decay = decay > 20 ? decay / 1000 : decay; // ms or s
  const tone = get('tone');
  if (tone !== undefined) p.tone = tone > 1 ? tone / 100 : tone;
  const drive = get('drive');
  if (drive !== undefined && dev.engine === 'kick') p.drive = drive > 1 ? drive / 100 : drive;
  const click = get('click');
  if (click !== undefined && dev.engine === 'kick') p.click = click > 1 ? click / 100 : click;
  return { ...newDrumSynth(dev.engine, dev.model, p), from: `Live ${deviceName.replace(/\.amxd$/i, '')}` };
}

/** How long a hit rings, in seconds — the pad's outer envelope is opened to this so it never
 *  cuts a drum synth short (the synth's own decay does the shaping). */
export function drumSynthLength(p: DrumSynthPatch): number {
  const d = dsParam(p, 'decay');
  if (p.engine === 'snare') return Math.max(d, dsParam(p, 'noiseDecay'));
  if (p.engine === 'clap') return d * (p.model === 'room' ? 1.6 : 1) + dsParam(p, 'bursts') * dsParam(p, 'spread');
  if (p.engine === 'hat' || p.engine === 'perc') return d + dsParam(p, 'attack');
  return d;
}

/** Put a Drum Synth patch on a pad: synth source, envelope opened to the hit's length. */
export function setPadDrumSynth(pad: { source: string; drumSynth?: DrumSynthPatch; synthVoice?: SynthVoiceId; empty?: boolean; env: { attackMs: number; holdMs: number; decayMs: number; sustain: number; releaseMs: number } }, patch: DrumSynthPatch): void {
  pad.source = 'synth';
  pad.drumSynth = patch;
  pad.empty = false;
  const len = drumSynthLength(patch);
  // Sub kicks sustain under a held pad like the legacy sub; everything else is a one-shot.
  pad.env = patch.model === 'sub'
    ? { attackMs: 0, holdMs: 0, decayMs: Math.round(len * 1000), sustain: 0.7, releaseMs: 220 }
    : { attackMs: 0, holdMs: Math.round(len * 1000), decayMs: 60, sustain: 0, releaseMs: 80 };
}
