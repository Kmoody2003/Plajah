import type { MusicEngineId } from '../../musicEnginePolicy';
import type { VocalRegenRequest } from '../direct/vocalScore';
import type { EnsemblePlan } from './ensemblePlan';

export type GenerationKind = 'audio' | 'midi' | 'sample' | 'transcribe';
export interface GeneratedNote { startBeats: number; lengthBeats: number; key: number; vel: number }

/**
 * ACE-Step 1.5 documented HTTP `/release_task` `task_type` values (`docs/en/API.md` & `acestep/constants.py`).
 * Note: ACE-Step 1.5 has no separate `extend` or `audio2audio` task_type — song extension uses `repaint`
 * with `windowEndSec` past the existing section, and audio-to-audio / remix uses `cover`.
 */
export const ACE_TASK_TYPES = ['text2music', 'repaint', 'cover', 'lego', 'extract', 'complete'] as const;
export type AceTaskType = typeof ACE_TASK_TYPES[number];
export const ACE_BASE_ONLY_TASKS: readonly AceTaskType[] = ['lego', 'extract', 'complete'];

/** Named stems supported by ACE-Step 1.5 `lego`, `extract`, and `complete` (`acestep/constants.py` `TRACK_NAMES`). */
export const ACE_TRACK_NAMES = [
  'woodwinds', 'brass', 'fx', 'synth', 'strings', 'percussion',
  'keyboard', 'guitar', 'bass', 'drums', 'backing_vocals', 'vocals',
] as const;
export type AceTrackName = typeof ACE_TRACK_NAMES[number];

/** Score note passed to `soulx-singer` (`--control score`), times in seconds from window start. */
export interface ScoreVocalNote {
  syllable: string;
  key: number;
  startSec: number;
  lengthSec: number;
  vel?: number;
}

/** Safe, user-facing adapter refusal error (e.g. checkpoint mismatch) containing no local paths or secrets. */
export class AdapterUserError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

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
  purpose?: 'arrangement-plan';
  /** ACE-Step 1.5 task_type (default 'text2music'). */
  task?: AceTaskType;
  /** Base64 source audio (<= 20 MB) for ACE-Step repaint / cover / lego / extract / complete (`src_audio`). */
  sourceAudio?: string;
  /** Repaint / lego window start in seconds (0..600). Maps to `repainting_start`. */
  windowStartSec?: number;
  /** Repaint / lego window end in seconds (> windowStartSec..600, or -1 for end of audio). Maps to `repainting_end`. */
  windowEndSec?: number;
  /** Base64 reference audio (<= 20 MB) for ACE-Step style transfer (`reference_audio`) or SoulX-Singer voice prompt (`--prompt_wav_path`). */
  referenceAudio?: string;
  /** ACE-Step `audio_cover_strength` (0.0..1.0). Lower (~0.2) for style transfer, higher (~0.8-1.0) for cover. */
  coverStrength?: number;
  /** Named stem (`ACE_TRACK_NAMES`) required for ACE-Step `lego` and `extract` (`track_name`). */
  trackName?: AceTrackName;
  /** Named stems (`ACE_TRACK_NAMES[]`) for ACE-Step `complete` (`track_classes`). */
  trackClasses?: AceTrackName[];
  /** Full-song context caption for ACE-Step `lego` (`global_caption`). */
  globalCaption?: string;
  /** Vocal language tag (e.g. 'en', 'zh', 'yue') for ACE-Step (`vocal_language`) or SoulX-Singer. */
  vocalLanguage?: string;
  /** Exact score notes for `soulx-singer`. */
  vocalNotes?: ScoreVocalNote[];
  /** SoulX-Singer `--auto_shift` flag. */
  autoShift?: boolean;
  /** SoulX-Singer `--pitch_shift` in semitones (-24..24). */
  pitchShift?: number;
}
export interface GenerationResult {
  notes?: GeneratedNote[];
  abc?: string;
  audioAvailable?: boolean;
  mime?: string;
  warning?: string;
  plan?: EnsemblePlan;
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
  'ace-step-2.5': ['audio', 'midi', 'sample'],
  'ace-step': ['audio', 'sample'],
  heartmula: ['audio'],
  'heartmula-rl-3b': ['audio'],
  'soulx-singer': ['audio'],
  'qwen-score': ['midi'],
  'basic-pitch': ['transcribe'],
  yue2: ['audio', 'midi'],
  sheetsage2: ['transcribe'],
};

const BASE64_AUDIO_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_BASE64_AUDIO_CHARS = 28000000; // ~20 MB binary

function validateBase64Audio(value: unknown, message = 'Choose an audio file smaller than 20 MB'): string {
  if (typeof value !== 'string' || !value.length || value.length > MAX_BASE64_AUDIO_CHARS || !BASE64_AUDIO_RE.test(value)) {
    throw new Error(message);
  }
  return value;
}

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
    bpm: number(raw.bpm, 30, 300), bars: number(raw.bars, 1, 128),
    seconds: number(raw.seconds, 1, 360), key: text(raw.key, 40), seed: number(raw.seed, 0, 2147483647),
  };
  if (!Number.isInteger(request.bars) || !Number.isInteger(request.seed)) throw new Error('Bars and seed must be integers');

  const isAce = engine === 'ace-step' || engine === 'ace-step-2.5';
  let task: AceTaskType | undefined;
  if (raw.task !== undefined) {
    if (!isAce) throw new Error('Task edit modes are only supported on ACE-Step engines');
    if (!(ACE_TASK_TYPES as readonly string[]).includes(raw.task)) {
      throw new Error(`Unsupported ACE-Step task; supported tasks are ${ACE_TASK_TYPES.join(', ')}`);
    }
    task = raw.task as AceTaskType;
    if (task !== 'text2music' && request.kind !== 'audio') {
      throw new Error('ACE-Step edit tasks require audio output kind');
    }
    request.task = task;
  }

  const promptOptional = request.kind === 'transcribe' || task === 'extract' || engine === 'soulx-singer';
  if (!promptOptional && !request.prompt) throw new Error('Describe what you want to create');

  if (raw.abc) request.abc = text(raw.abc, 100000);
  if (raw.purpose !== undefined) {
    if (raw.purpose !== 'arrangement-plan' || engine !== 'qwen-score' || request.kind !== 'midi') throw new Error('Unsupported composition purpose');
    request.purpose = raw.purpose;
  }
  if (request.kind === 'transcribe') {
    request.inputAudio = validateBase64Audio(raw.inputAudio);
  }
  if (raw.vocalLanguage !== undefined) {
    const lang = text(raw.vocalLanguage, 32);
    if (lang) request.vocalLanguage = lang;
  }

  if (isAce) {
    const effectiveTask: AceTaskType = task ?? 'text2music';
    if (raw.referenceAudio !== undefined) {
      request.referenceAudio = validateBase64Audio(raw.referenceAudio, 'Reference audio must be valid base64 smaller than 20 MB');
    }
    if (raw.coverStrength !== undefined) {
      request.coverStrength = number(raw.coverStrength, 0, 1);
    }
    if (effectiveTask === 'text2music') {
      if (raw.sourceAudio !== undefined) throw new Error('Source audio requires an ACE-Step edit task (repaint, cover, lego, extract, or complete)');
    } else {
      request.sourceAudio = validateBase64Audio(raw.sourceAudio, 'Source audio is required for ACE-Step edit tasks and must be smaller than 20 MB');
    }
    if (effectiveTask === 'repaint') {
      const start = number(raw.windowStartSec, 0, 600);
      if (typeof raw.windowEndSec !== 'number' || !Number.isFinite(raw.windowEndSec)) {
        throw new Error('Repaint requires windowStartSec and windowEndSec');
      }
      if (raw.windowEndSec !== -1 && (raw.windowEndSec <= start || raw.windowEndSec > 600)) {
        throw new Error('windowEndSec must be -1 (end of audio) or greater than windowStartSec up to 600 seconds');
      }
      request.windowStartSec = start;
      request.windowEndSec = raw.windowEndSec;
    } else if (effectiveTask === 'lego') {
      if (!(ACE_TRACK_NAMES as readonly string[]).includes(raw.trackName)) {
        throw new Error(`lego requires a valid trackName (${ACE_TRACK_NAMES.join(', ')})`);
      }
      request.trackName = raw.trackName as AceTrackName;
      if (raw.globalCaption !== undefined) request.globalCaption = text(raw.globalCaption, 4000);
      if (raw.windowStartSec !== undefined) request.windowStartSec = number(raw.windowStartSec, 0, 600);
      if (raw.windowEndSec !== undefined) {
        if (typeof raw.windowEndSec !== 'number' || !Number.isFinite(raw.windowEndSec)) throw new Error('Invalid windowEndSec');
        const start = request.windowStartSec ?? 0;
        if (raw.windowEndSec !== -1 && (raw.windowEndSec <= start || raw.windowEndSec > 600)) {
          throw new Error('windowEndSec must be -1 or greater than windowStartSec up to 600 seconds');
        }
        request.windowEndSec = raw.windowEndSec;
      }
    } else if (effectiveTask === 'extract') {
      if (!(ACE_TRACK_NAMES as readonly string[]).includes(raw.trackName)) {
        throw new Error(`extract requires a valid trackName (${ACE_TRACK_NAMES.join(', ')})`);
      }
      request.trackName = raw.trackName as AceTrackName;
    } else if (effectiveTask === 'complete') {
      if (raw.trackClasses !== undefined) {
        if (!Array.isArray(raw.trackClasses) || !raw.trackClasses.length || raw.trackClasses.length > ACE_TRACK_NAMES.length ||
          raw.trackClasses.some((t: unknown) => !(ACE_TRACK_NAMES as readonly string[]).includes(String(t)))) {
          throw new Error(`complete trackClasses must be non-empty valid ACE track names (${ACE_TRACK_NAMES.join(', ')})`);
        }
        request.trackClasses = [...new Set(raw.trackClasses as AceTrackName[])];
      }
    }
  } else {
    for (const aceOnly of ['sourceAudio', 'windowStartSec', 'windowEndSec', 'coverStrength', 'trackName', 'trackClasses', 'globalCaption'] as const) {
      if (raw[aceOnly] !== undefined) throw new Error(`${aceOnly} is only supported on ACE-Step engines`);
    }
  }

  if (engine === 'soulx-singer') {
    if (!Array.isArray(raw.vocalNotes) || !raw.vocalNotes.length || raw.vocalNotes.length > 4000) {
      throw new Error('SoulX-Singer requires 1 to 4000 score notes in vocalNotes');
    }
    request.vocalNotes = raw.vocalNotes.map((n: any) => {
      if (!n || typeof n !== 'object' || typeof n.syllable !== 'string' || n.syllable.length > 64) {
        throw new Error('Invalid vocal note syllable');
      }
      const startSec = number(n.startSec, 0, 600);
      const lengthSec = number(n.lengthSec, 0.02, 60);
      if (startSec + lengthSec > 600) throw new Error('Vocal note exceeds 600-second window');
      const key = number(n.key, 0, 127);
      const vel = n.vel === undefined ? 90 : number(n.vel, 1, 127);
      return { syllable: n.syllable.trim(), key: Math.round(key), startSec, lengthSec, vel: Math.round(vel) };
    });
    if (raw.referenceAudio !== undefined) {
      request.referenceAudio = validateBase64Audio(raw.referenceAudio, 'Reference voice audio must be valid base64 smaller than 20 MB');
    }
    if (raw.autoShift !== undefined) {
      if (typeof raw.autoShift !== 'boolean') throw new Error('autoShift must be a boolean');
      request.autoShift = raw.autoShift;
    }
    if (raw.pitchShift !== undefined) {
      const ps = number(raw.pitchShift, -24, 24);
      if (!Number.isInteger(ps)) throw new Error('pitchShift must be an integer');
      request.pitchShift = ps;
    }
  } else if (!isAce && raw.referenceAudio !== undefined) {
    throw new Error('referenceAudio is only supported on ACE-Step and SoulX-Singer');
  }

  return request;
}

/** Build a validated ACE-Step `repaint` `GenerationRequest` from a Chora Direct `VocalRegenRequest`. */
export function vocalRegenToAceRepaintRequest(
  regen: VocalRegenRequest,
  opts: {
    sourceAudio: string;
    totalSeconds?: number;
    referenceAudio?: string;
    engine?: 'ace-step' | 'ace-step-2.5';
    seed?: number;
  },
): GenerationRequest {
  const bpm = Math.min(300, Math.max(30, regen.bpm));
  const durationSec = Math.min(360, Math.max(10, Math.ceil(opts.totalSeconds ?? Math.max(10, regen.endSec))));
  const bars = Math.min(128, Math.max(1, Math.ceil((durationSec * bpm) / 240)));
  const contextLyrics = [regen.lyricsBefore, regen.lyrics, regen.lyricsAfter].map(s => s.trim()).filter(Boolean).join('\n');
  return validateGenerationRequest({
    engine: opts.engine ?? 'ace-step',
    kind: 'audio',
    task: 'repaint',
    prompt: regen.prompt,
    lyrics: contextLyrics || regen.lyrics,
    vocalLanguage: regen.language || 'en',
    sourceAudio: opts.sourceAudio,
    ...(opts.referenceAudio ? { referenceAudio: opts.referenceAudio } : {}),
    windowStartSec: regen.startSec,
    windowEndSec: regen.endSec,
    bpm,
    bars,
    seconds: durationSec,
    key: regen.key,
    seed: opts.seed ?? 0,
  });
}

/** Build a validated `soulx-singer` score-controlled `GenerationRequest` from a `VocalRegenRequest`. */
export function vocalRegenToSoulxRequest(
  regen: VocalRegenRequest,
  opts: {
    referenceAudio?: string;
    seed?: number;
    autoShift?: boolean;
    pitchShift?: number;
  } = {},
): GenerationRequest {
  const bpm = Math.min(300, Math.max(30, regen.bpm));
  const spanSec = Math.min(360, Math.max(1, Math.ceil(Math.max(1, regen.endSec - regen.startSec))));
  const bars = Math.min(128, Math.max(1, Math.ceil((spanSec * bpm) / 240)));
  return validateGenerationRequest({
    engine: 'soulx-singer',
    kind: 'audio',
    prompt: regen.prompt,
    lyrics: regen.lyrics,
    vocalLanguage: regen.language || 'en',
    vocalNotes: regen.notes.map(n => ({
      syllable: n.syllable,
      key: n.key,
      startSec: n.startSec,
      lengthSec: n.lengthSec,
      vel: n.vel,
    })),
    ...(opts.referenceAudio ? { referenceAudio: opts.referenceAudio } : {}),
    autoShift: opts.autoShift ?? true,
    pitchShift: opts.pitchShift ?? 0,
    bpm,
    bars,
    seconds: spanSec,
    key: regen.key,
    seed: opts.seed ?? 0,
  });
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
