import type { MusicEngineId } from '../../musicEnginePolicy';

export type GenerationKind = 'audio' | 'midi' | 'sample' | 'transcribe';
export interface GeneratedNote { startBeats: number; lengthBeats: number; key: number; vel: number }
export interface GenerationRequest {
  engine: MusicEngineId;
  kind: GenerationKind;
  prompt: string;
  lyrics: string;
  bpm: number;
  bars: number;
  seconds: number;
  key: string;
  seed: number;
  abc?: string;
  inputAudio?: string;
}
export interface GenerationResult {
  notes?: GeneratedNote[];
  abc?: string;
  audioAvailable?: boolean;
  mime?: string;
  warning?: string;
}
export interface GenerationJob {
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  engine: MusicEngineId;
  createdAt: number;
  message: string;
  result?: GenerationResult;
}
export const ENGINE_KINDS: Record<MusicEngineId, readonly GenerationKind[]> = {
  'ace-step': ['audio', 'sample'], heartmula: ['audio'],
  'qwen-score': ['midi'], 'basic-pitch': ['transcribe'],
  yue2: ['audio', 'midi'], sheetsage2: ['transcribe'],
};

export function validateGenerationRequest(raw: any): GenerationRequest {
  if (!raw || typeof raw !== 'object' || !Object.hasOwn(ENGINE_KINDS, raw.engine)) throw new Error('Choose a supported engine');
  const engine = raw.engine as MusicEngineId;
  if (!ENGINE_KINDS[engine].includes(raw.kind)) throw new Error('This engine does not support that output');
  const text = (value: unknown, max: number) => {
    if (value === undefined) return '';
    if (typeof value !== 'string' || value.length > max) throw new Error('Text input is too long or invalid');
    return value.trim();
  };
  const number = (value: unknown, min: number, max: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Number must be between ${min} and ${max}`);
    return value;
  };
  const request: GenerationRequest = {
    engine, kind: raw.kind, prompt: text(raw.prompt, 4000), lyrics: text(raw.lyrics, 12000),
    bpm: number(raw.bpm, 30, 300), bars: number(raw.bars, 1, 16),
    seconds: number(raw.seconds, 1, 120), key: text(raw.key, 40), seed: number(raw.seed, 0, 2147483647),
  };
  if (!Number.isInteger(request.bars) || !Number.isInteger(request.seed)) throw new Error('Bars and seed must be integers');
  if (request.kind !== 'transcribe' && !request.prompt) throw new Error('Describe what you want to create');
  if (raw.abc) request.abc = text(raw.abc, 100000);
  if (request.kind === 'transcribe') {
    if (typeof raw.inputAudio !== 'string' || !raw.inputAudio.length || raw.inputAudio.length > 28000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.inputAudio)) throw new Error('Choose an audio file smaller than 20 MB');
    request.inputAudio = raw.inputAudio;
  }
  return request;
}

/** Reject unusable model output instead of inserting NaN, silent, or unbounded clips. */
export function validateGeneratedNotes(raw: unknown, maxBeats = 4096): GeneratedNote[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 20000) throw new Error('The model returned no usable notes or too many notes');
  return raw.map(note => {
    const values = [note?.startBeats, note?.lengthBeats, note?.key, note?.vel];
    if (values.some(value => typeof value !== 'number' || !Number.isFinite(value)) || note.startBeats < 0 || note.lengthBeats <= 0 || note.startBeats + note.lengthBeats > maxBeats || note.key < 0 || note.key > 127 || note.vel < 1 || note.vel > 127) throw new Error('The model returned invalid note timing, pitch or velocity');
    return { startBeats: note.startBeats, lengthBeats: note.lengthBeats, key: Math.round(note.key), vel: Math.round(note.vel) };
  }).sort((a, b) => a.startBeats - b.startBeats);
}
