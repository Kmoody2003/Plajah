// Magenta RealTime 2 (Google, code Apache 2.0, weights CC-BY 4.0) conditioning for Chora Studio.
// Shared by the client (builds the request) and the server adapter (builds pianoroll runs for the sidecar).
// Token layout comes from magenta_rt/config.py: 25 Hz frames, 128-pitch pianoroll with states
// -1 masked, 0 off, 1 sustain, 2 onset, 3 "model decides" (auto-strum); drums -1 masked, 0 off, 1 on.

export const MAGENTA_FRAME_RATE = 25;
export const MAGENTA_MAX_SECONDS = 120;
export const MAGENTA_MAX_STYLES = 4;
export const MAGENTA_ATTRIBUTION = 'Generated with Magenta RealTime 2 by Google DeepMind (weights CC-BY 4.0).';

export type MagentaDrums = 'auto' | 'on' | 'off';

/** A guide note in seconds from the start of the render window (tempo map already applied by the client). */
export interface MagentaGuideNote { startSec: number; lengthSec: number; key: number }

export interface MagentaStyle { text: string; weight: number }

export interface MagentaOptions {
  /** Extra text styles blended with the prompt (weighted average of MusicCoCa embeddings). */
  styles?: MagentaStyle[];
  /** Weight of `referenceAudio` in the style blend (0..1). Prompt weight is 1 unless `promptWeight` is set. */
  audioStyleWeight?: number;
  promptWeight?: number;
  /** Notes the ensemble must follow (e.g. a MIDI clip from the timeline). */
  guideNotes?: MagentaGuideNote[];
  /** true: give the model the held pitches and let it place onsets; false: exact onsets from the notes. */
  autoStrum?: boolean;
  drums?: MagentaDrums;
  /** Classifier-free guidance per signal, each in [-1, 7] (model bins them). */
  cfgStyle?: number;
  cfgNotes?: number;
  cfgDrums?: number;
  temperature?: number;
  topK?: number;
}

/** One stretch of frames with identical note conditioning. Pitches absent from both lists are off (0). */
export interface MagentaRun { frames: number; held: number[]; onset: number[] }

function num(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

export function validateMagentaOptions(raw: unknown, seconds: number): MagentaOptions {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid Magenta options');
  const r = raw as Record<string, unknown>;
  const out: MagentaOptions = {};
  if (r.styles !== undefined) {
    if (!Array.isArray(r.styles) || r.styles.length > MAGENTA_MAX_STYLES) throw new Error(`Up to ${MAGENTA_MAX_STYLES} extra styles`);
    out.styles = r.styles.map((s: any) => {
      if (!s || typeof s.text !== 'string' || !s.text.trim() || s.text.length > 300) throw new Error('Each style needs a short description');
      return { text: s.text.trim(), weight: num(s.weight, 0, 1, 'Style weight') };
    });
  }
  if (r.audioStyleWeight !== undefined) out.audioStyleWeight = num(r.audioStyleWeight, 0, 1, 'Audio style weight');
  if (r.promptWeight !== undefined) out.promptWeight = num(r.promptWeight, 0, 1, 'Prompt weight');
  if (r.guideNotes !== undefined) {
    if (!Array.isArray(r.guideNotes) || r.guideNotes.length > 8000) throw new Error('Guide notes must be a list of up to 8000 notes');
    out.guideNotes = r.guideNotes.map((n: any) => {
      if (!n || typeof n !== 'object') throw new Error('Invalid guide note');
      const startSec = num(n.startSec, 0, seconds, 'Guide note start');
      const lengthSec = num(n.lengthSec, 0.01, MAGENTA_MAX_SECONDS, 'Guide note length');
      const key = num(n.key, 0, 127, 'Guide note pitch');
      return { startSec, lengthSec: Math.min(lengthSec, seconds - startSec), key: Math.round(key) };
    }).filter(n => n.lengthSec > 0);
  }
  if (r.autoStrum !== undefined) {
    if (typeof r.autoStrum !== 'boolean') throw new Error('autoStrum must be true or false');
    out.autoStrum = r.autoStrum;
  }
  if (r.drums !== undefined) {
    if (r.drums !== 'auto' && r.drums !== 'on' && r.drums !== 'off') throw new Error('Drums must be auto, on or off');
    out.drums = r.drums;
  }
  if (r.cfgStyle !== undefined) out.cfgStyle = num(r.cfgStyle, -1, 7, 'Style guidance');
  if (r.cfgNotes !== undefined) out.cfgNotes = num(r.cfgNotes, -1, 7, 'Notes guidance');
  if (r.cfgDrums !== undefined) out.cfgDrums = num(r.cfgDrums, -1, 7, 'Drums guidance');
  if (r.temperature !== undefined) out.temperature = num(r.temperature, 0.1, 3, 'Temperature');
  if (r.topK !== undefined) {
    out.topK = num(r.topK, 1, 1024, 'Top-k');
    if (!Number.isInteger(out.topK)) throw new Error('Top-k must be a whole number');
  }
  return out;
}

/**
 * Collapse guide notes into runs of identical 25 Hz pianoroll frames so the sidecar
 * can call `generate(frames=run.frames, state=...)` once per run instead of once per frame.
 * Returns [] when there are no guide notes (the sidecar then leaves notes masked).
 */
export function buildPianorollRuns(notes: MagentaGuideNote[] | undefined, seconds: number, autoStrum = true): MagentaRun[] {
  if (!notes?.length) return [];
  const total = Math.max(1, Math.round(seconds * MAGENTA_FRAME_RATE));
  const held: Set<number>[] = Array.from({ length: total }, () => new Set());
  const onset: Set<number>[] = Array.from({ length: total }, () => new Set());
  for (const n of notes) {
    const start = Math.min(total - 1, Math.max(0, Math.round(n.startSec * MAGENTA_FRAME_RATE)));
    const end = Math.min(total, Math.max(start + 1, Math.round((n.startSec + n.lengthSec) * MAGENTA_FRAME_RATE)));
    for (let f = start; f < end; f++) held[f].add(n.key);
    if (!autoStrum) onset[start].add(n.key);
  }
  const runs: MagentaRun[] = [];
  let sig = '';
  for (let f = 0; f < total; f++) {
    const on = [...onset[f]].sort((a, b) => a - b);
    const hold = [...held[f]].filter(k => !onset[f].has(k)).sort((a, b) => a - b);
    const next = `${hold.join(',')}|${on.join(',')}`;
    const last = runs[runs.length - 1];
    // Onset frames are always their own 1-frame run: the onset applies only to that frame.
    if (last && next === sig && !on.length) last.frames++;
    else runs.push({ frames: 1, held: hold, onset: on });
    sig = on.length ? '' : next;
  }
  return runs;
}
