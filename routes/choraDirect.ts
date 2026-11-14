// Chora Direct — cloud writer lane for the brief (`POST /api/chora/direct/write`).
//
// Desktop/on-device engines run first; this server route is only invoked when the user has given
// explicit cloud consent (`cloudConsent: true` -> otherwise HTTP 428).
//
// Grounding contract (G4):
//   - Never invent a second grounding format. The user prompt is `briefGrounding(brief, { chair, sectionId })`
//     plus the council's plain-text note-line instructions (`bar beat length pitch`, see
//     `services/melos/beats/council/noteLines.ts`).
//   - Raw model output is validated exclusively with `parseNoteLines` from `noteLines.ts` and
//     re-serialised with `toLines` so callers receive both `ComposedNote[]` and canonical note lines.

import express, { Router, type RequestHandler } from 'express';
import {
  createGeminiLane,
  geminiConfigured,
  laneModel,
  summarizeUsage,
  type GeminiUsage,
  type LaneFn,
} from '../services/ai/geminiLane';
import {
  PART_ROLES,
  type ComposeContext,
  type ContextBar,
  type PartRole,
} from '../services/melos/beats/council/composeContext';
import { ROLE_RANGE, type ComposedNote } from '../services/melos/beats/council/composeCouncil';
import { parseNoteLines, toLines } from '../services/melos/beats/council/noteLines';
import {
  briefGrounding,
  briefToBandChart,
  briefToEnsemblePlan,
  briefToLyricLines,
  briefToRenderRequest,
  compileSongBrief,
  reviewBrief,
  type BriefSection,
  type SongBrief,
} from '../services/melos/direct/songBrief';
import { parseSongPrompt } from '../services/melos/direct/songPrompt';
import { layoutVocal } from '../services/melos/direct/vocalScore';
import type { Chair } from '../services/melos/direct/styleKnowledge';
import { renderBriefHeadless } from '../services/melos/render';
import { recognizeChordsFromAudio } from '../services/melos/transcribe';
import { midiToName } from '../services/melos/theory';

export const CHORA_DIRECT_MODEL_ENV = 'CHORA_DIRECT_MODEL';

const VALID_CHAIRS: readonly Chair[] = [
  'drums',
  'percussion',
  'bass',
  'guitar',
  'piano',
  'cello',
  'violin',
  'trumpet',
  'sax',
  'woodwinds',
  'synth',
  'organ',
  'orchestra',
] as const;

interface ChairSpec {
  role: PartRole;
  range: [number, number];
  polyphonic: boolean;
  drumKit?: boolean;
  hint: string;
}

const CHAIR_SPECS: Record<Chair, ChairSpec> = {
  drums: {
    role: 'fill',
    range: [35, 59],
    polyphonic: true,
    drumKit: true,
    hint: 'drum kit groove using General MIDI drum note names (C2 kick, D2 snare, C#2 rim, F#2 closed hat, A#2 open hat, C#3 crash, D#3 ride)',
  },
  percussion: {
    role: 'fill',
    range: [35, 76],
    polyphonic: true,
    drumKit: true,
    hint: 'percussion pattern using General MIDI percussion note names (D#2 clap, G#2 pedal hat, C4 hi bongo, C#4 low bongo, D4 mute conga, D#4 open conga, A#4 maracas)',
  },
  bass: {
    role: 'bass',
    range: ROLE_RANGE.bass,
    polyphonic: false,
    hint: 'the bass line (one note at a time, locking to the harmony and groove)',
  },
  guitar: {
    role: 'harmony',
    range: [40, 84],
    polyphonic: true,
    hint: 'the guitar part (idiomatic voicings, comping or riffing in guitar range)',
  },
  piano: {
    role: 'harmony',
    range: ROLE_RANGE.harmony,
    polyphonic: true,
    hint: 'the keyboard / piano part (voice-led chord comping or motif)',
  },
  organ: {
    role: 'harmony',
    range: ROLE_RANGE.harmony,
    polyphonic: true,
    hint: 'the organ part (sustained chords and rhythmic comping)',
  },
  cello: {
    role: 'counter-melody',
    range: [36, 72],
    polyphonic: false,
    hint: 'the cello line (warm low strings / counter-line, one note at a time)',
  },
  violin: {
    role: 'melody',
    range: ROLE_RANGE.melody,
    polyphonic: false,
    hint: 'the violin / upper string line (singing melodic phrasing, one note at a time)',
  },
  trumpet: {
    role: 'melody',
    range: [54, 84],
    polyphonic: false,
    hint: 'the trumpet line (idiomatic brass phrasing with breath spaces, one note at a time)',
  },
  sax: {
    role: 'melody',
    range: [50, 82],
    polyphonic: false,
    hint: 'the saxophone line (idiomatic horn phrasing with breath spaces, one note at a time)',
  },
  woodwinds: {
    role: 'melody',
    range: [55, 88],
    polyphonic: false,
    hint: 'the woodwind line (agile lyrical phrasing with breath spaces, one note at a time)',
  },
  synth: {
    role: 'arp',
    range: ROLE_RANGE.arp,
    polyphonic: true,
    hint: 'the synth part (hook, arpeggio or pad matching the style brief)',
  },
  orchestra: {
    role: 'pad',
    range: ROLE_RANGE.pad,
    polyphonic: true,
    hint: 'the orchestral ensemble part (balanced voicings across the section)',
  },
};

export interface ChoraDirectDeps {
  authenticate?: RequestHandler;
  requireRegisteredUser?: RequestHandler;
  limiter?: RequestHandler;
  /** Optional injected lane for deterministic unit tests (avoids network / API keys). */
  lane?: LaneFn;
  configured?: () => boolean;
}

function isSongBrief(x: unknown): x is SongBrief {
  if (!x || typeof x !== 'object') return false;
  const b = x as Partial<SongBrief>;
  return (
    typeof b.bpm === 'number' &&
    Array.isArray(b.sections) &&
    Array.isArray(b.meter) &&
    b.meter.length === 2 &&
    !!b.pack &&
    typeof b.pack === 'object'
  );
}

function isChair(x: unknown): x is Chair {
  return typeof x === 'string' && (VALID_CHAIRS as readonly string[]).includes(x);
}

function isPartRole(x: unknown): x is PartRole {
  return typeof x === 'string' && (PART_ROLES as readonly string[]).includes(x);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveSectionFromBrief(brief: SongBrief, sectionInput: unknown): BriefSection | undefined {
  if (!brief.sections.length) return undefined;
  if (!sectionInput) return brief.sections[0];
  if (typeof sectionInput === 'object' && sectionInput !== null) {
    const id = (sectionInput as { id?: unknown }).id;
    if (typeof id === 'string') {
      const byId = brief.sections.find((s) => s.id === id);
      if (byId) return byId;
    }
  }
  if (typeof sectionInput === 'string') {
    const q = sectionInput.trim();
    if (!q) return brief.sections[0];
    return (
      brief.sections.find((s) => s.id === q) ??
      brief.sections.find((s) => s.label.toLowerCase() === q.toLowerCase()) ??
      brief.sections.find((s) => s.kind.toLowerCase() === q.toLowerCase())
    );
  }
  return undefined;
}

function parseMeterAndTempoFromGrounding(grounding: string): {
  meter: [number, number];
  beatsPerBar: number;
  bpm: number;
  key: string;
} {
  const firstLine = grounding.split(/\r?\n/, 1)[0] ?? '';
  const meterMatch = firstLine.match(/\b(\d+)\/(\d+)\b/);
  const num = meterMatch ? Math.max(1, Math.min(16, Number(meterMatch[1]))) : 4;
  const den = meterMatch && [2, 4, 8, 16].includes(Number(meterMatch[2])) ? Number(meterMatch[2]) : 4;
  const beatsPerBar = (num * 4) / den;
  const bpmMatch = firstLine.match(/\b(\d+(?:\.\d+)?)\s*BPM\b/i);
  const bpm = bpmMatch ? Math.max(30, Math.min(300, Number(bpmMatch[1]))) : 120;
  const keyMatch = firstLine.match(/\bkey\s+([A-G][#b]?\s+[a-zA-Z_-]+)/i);
  const key = keyMatch ? keyMatch[1] : 'C major';
  return { meter: [num, den], beatsPerBar, bpm, key };
}

function parseBarWindowFromGrounding(
  grounding: string,
  sectionHint: string | undefined,
): { startBar1: number; count: number } | null {
  const focused = grounding.match(/^>>\s*[^\n:]+:\s*bars\s+(\d+)[–-](\d+)\b/m);
  if (focused) {
    const a = Number(focused[1]);
    const b = Number(focused[2]);
    if (a >= 1 && b >= a) return { startBar1: a, count: b - a + 1 };
  }
  if (sectionHint) {
    const re = new RegExp(
      `^(?:>>\\s*)?${escapeRegExp(sectionHint.trim())}:\\s*bars\\s+(\\d+)[–-](\\d+)\\b`,
      'im',
    );
    const m = grounding.match(re);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a >= 1 && b >= a) return { startBar1: a, count: b - a + 1 };
    }
  }
  const first = grounding.match(/^\s*(?:>>\s*)?[^\n:]+:\s*bars\s+(\d+)[–-](\d+)\b/m);
  if (first) {
    const a = Number(first[1]);
    const b = Number(first[2]);
    if (a >= 1 && b >= a) return { startBar1: a, count: b - a + 1 };
  }
  return null;
}

export function buildDirectComposeContext(params: {
  firstBar1: number;
  barCount: number;
  beatsPerBar: number;
  meter: [number, number];
  bpm: number;
  key: string;
  role: PartRole;
  chair: string;
  sectionLabel?: string;
  chordsPerBar?: string[][];
}): ComposeContext {
  const { firstBar1, barCount, beatsPerBar, meter, bpm, key, role, chair, sectionLabel, chordsPerBar } = params;
  const bars: ContextBar[] = Array.from({ length: barCount }, (_, i) => ({
    bar: firstBar1 + i,
    at: Math.round(i * beatsPerBar * 1000) / 1000,
    beats: beatsPerBar,
    sig: `${meter[0]}/${meter[1]}`,
    inRegion: true,
    section: sectionLabel,
    chord: chordsPerBar?.[i]?.join(' '),
  }));
  const totalBeats = Math.round(barCount * beatsPerBar * 1000) / 1000;
  return {
    song: {
      title: 'Chora Direct',
      key,
      scaleTones: null,
      keyPc: 0,
      scaleId: 'major',
      tempo: `${Math.round(bpm)} BPM`,
      meter: `${meter[0]}/${meter[1]}`,
      sections: sectionLabel ? [`${sectionLabel} (bars ${firstBar1}–${firstBar1 + barCount - 1})`] : [],
      totalBars: firstBar1 + barCount - 1,
    },
    region: {
      startBar: firstBar1,
      endBar: firstBar1 + barCount - 1,
      beats: totalBeats,
      seconds: Math.round(((totalBeats * 60) / Math.max(30, bpm)) * 10) / 10,
    },
    bars,
    tracks: [],
    lyrics: [],
    request: {
      description: `Write ${chair} (${role})`,
      startBeats: (firstBar1 - 1) * beatsPerBar,
      endBeats: (firstBar1 - 1 + barCount) * beatsPerBar,
      targets: [{ role }],
      targetLabels: [`new:0 — a new ${role} part`],
    },
  };
}

/**
 * Build the exact prompt pair sent to Gemini:
 * - `system`: the council's `bar beat length pitch` line-format instructions (`noteLines.ts`).
 * - `user`: `briefGrounding(brief, { chair, sectionId })` verbatim + target bar range line.
 */
export function buildDirectWritePrompt(params: {
  grounding: string;
  chair: string;
  spec: ChairSpec;
  firstBar1: number;
  lastBar1: number;
  beatsPerBar: number;
}): { system: string; user: string } {
  const { grounding, chair, spec, firstBar1, lastBar1, beatsPerBar } = params;
  const [lo, hi] = spec.range;
  const system = [
    'You are a session musician writing ONE part for a song, as plain text.',
    'Write one note per line in this exact form: bar beat length pitch',
    `  bar    = the bar number (${firstBar1} to ${lastBar1})`,
    `  beat   = where the note starts in that bar, counting from 1 up to ${beatsPerBar} (1, 1.5, 2, 2.75 …)`,
    '  length = how long it lasts, in beats (0.25 = sixteenth, 0.5 = eighth, 1 = quarter, 2 = half)',
    '  pitch  = note name with octave: C4 is middle C, then C#4, Eb4, F#3, Bb4 …',
    'Example:',
    `${firstBar1} 1 1 A3`,
    `${firstBar1} 2 0.5 C4`,
    `${firstBar1} 2.5 0.5 B3`,
    spec.polyphonic
      ? 'Chord voicings or simultaneous kit hits may share the same bar and beat on separate lines with distinct pitches.'
      : 'It is ONE line of music: one note at a time, never two notes on the same beat.',
    `Stay between ${midiToName(lo)} and ${midiToName(hi)}.`,
    'Write only note lines. No words, no explanations, no headings, no code fences.',
  ].join('\n');

  const user = [
    grounding.trim(),
    '',
    `Write ${spec.hint} for chair "${chair}" across bars ${firstBar1} to ${lastBar1} now, one note per line (bar beat length pitch).`,
  ].join('\n');

  return { system, user };
}

export function createChoraDirectRouter(deps: ChoraDirectDeps = {}) {
  const router = Router();
  const isConfigured = deps.configured ?? (() => !!deps.lane || geminiConfigured());

  if (deps.limiter) router.use(deps.limiter);
  const smallJson = express.json({ limit: '256kb' });
  const audioJson = express.json({ limit: '4mb' });

  router.get('/ai-info', (_req, res) => {
    const model = laneModel(CHORA_DIRECT_MODEL_ENV);
    res.set('Cache-Control', 'public, max-age=600').json({
      provider: 'Google Gemini',
      model,
      configured: isConfigured(),
      sent: 'The song brief grounding, target chair, section, and bar window.',
    });
  });

  // ── Deterministic local endpoints (zero cloud AI, zero consent required) ──────

  router.post('/compile', smallJson, (req, res) => {
    const body = req.body ?? {};
    const hasPromptStr = typeof body.prompt === 'string' && body.prompt.trim().length > 0;
    const hasBoxInput =
      typeof body.style === 'string' || typeof body.lyrics === 'string' || typeof body.title === 'string';
    if (!hasPromptStr && !hasBoxInput) {
      return res.status(400).json({ error: 'Provide `prompt` or `{ style, lyrics }`.' });
    }
    const parsed = hasPromptStr
      ? parseSongPrompt(body.prompt)
      : parseSongPrompt({
          style: typeof body.style === 'string' ? body.style : undefined,
          lyrics: typeof body.lyrics === 'string' ? body.lyrics : undefined,
          title: typeof body.title === 'string' ? body.title : undefined,
        });
    const brief = compileSongBrief(parsed, {
      bpm: typeof body.bpm === 'number' && Number.isFinite(body.bpm) ? body.bpm : undefined,
      key: body.key && typeof body.key.tonic === 'number' ? body.key : undefined,
      meter: Array.isArray(body.meter) && body.meter.length === 2 ? body.meter : undefined,
    });
    const review = reviewBrief(brief);
    return res.json({
      parsed,
      brief,
      review,
      ensemblePlan: briefToEnsemblePlan(brief),
      bandChart: briefToBandChart(brief),
      renderRequest: briefToRenderRequest(brief),
      lyricLines: briefToLyricLines(brief),
      vocalLayer: layoutVocal(brief),
    });
  });

  router.post('/render-preview', smallJson, async (req, res) => {
    const body = req.body ?? {};
    let brief: SongBrief | undefined;
    if (isSongBrief(body.brief)) {
      brief = body.brief;
    } else if (typeof body.prompt === 'string' && body.prompt.trim()) {
      brief = compileSongBrief(parseSongPrompt(body.prompt));
    } else {
      return res.status(400).json({ error: 'Provide a compiled `brief` or `prompt` string.' });
    }
    const maxDurationSec =
      typeof body.maxDurationSec === 'number' && Number.isFinite(body.maxDurationSec)
        ? Math.max(1, Math.min(30, body.maxDurationSec))
        : Math.min(20, Math.max(4, brief.seconds));
    const sampleRate =
      typeof body.sampleRate === 'number' && Number.isFinite(body.sampleRate)
        ? Math.max(16000, Math.min(48000, Math.round(body.sampleRate)))
        : 22050;
    const bitDepth = body.bitDepth === 24 ? 24 : 16;

    const result = await renderBriefHeadless(brief, {
      sampleRate,
      bitDepth,
      maxDurationSec,
      targetLufs:
        typeof body.targetLufs === 'number' && Number.isFinite(body.targetLufs)
          ? body.targetLufs
          : undefined,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      backend: result.backend,
      sampleRate: result.sampleRate,
      bitDepth: result.bitDepth,
      durationSec: result.durationSec,
      noteCount: result.noteCount,
      drumHitCount: result.drumHitCount,
      measured: result.measured,
      wavBase64: Buffer.from(result.wavBytes).toString('base64'),
    });
  });

  router.post('/transcribe-chords', audioJson, (req, res) => {
    const body = req.body ?? {};
    const sampleRate = Number(body.sampleRate);
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
      return res.status(400).json({ error: '`sampleRate` must be between 8000 and 96000 Hz.' });
    }
    let pcm: Float32Array | null = null;
    if (typeof body.pcmBase64 === 'string' && body.pcmBase64.length) {
      const raw = Buffer.from(body.pcmBase64, 'base64');
      if (raw.byteLength % 4 !== 0 || raw.byteLength === 0) {
        return res.status(400).json({ error: '`pcmBase64` must encode non-empty float32 samples.' });
      }
      pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    } else if (Array.isArray(body.pcm) && body.pcm.length) {
      pcm = Float32Array.from(body.pcm, (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
    }
    if (!pcm || pcm.length < 64) {
      return res.status(400).json({ error: 'Provide `pcmBase64` (float32le) or `pcm` sample array.' });
    }
    const beatTimes = Array.isArray(body.beatTimes)
      ? body.beatTimes.filter((t: unknown) => typeof t === 'number' && Number.isFinite(t))
      : undefined;
    const result = recognizeChordsFromAudio(pcm, sampleRate, beatTimes, {
      beatsPerBar:
        typeof body.beatsPerBar === 'number' && Number.isFinite(body.beatsPerBar)
          ? body.beatsPerBar
          : undefined,
      doc: body.doc && typeof body.doc === 'object' ? body.doc : undefined,
    });
    return res.json(result);
  });

  const writeGuards: RequestHandler[] = [];
  if (deps.authenticate) writeGuards.push(deps.authenticate);
  if (deps.requireRegisteredUser) writeGuards.push(deps.requireRegisteredUser);

  router.post('/write', smallJson, ...writeGuards, async (req: any, res) => {
    const body = req.body ?? {};
    if (body.cloudConsent !== true) {
      return res.status(428).json({
        error: 'Running this in the cloud needs your OK first.',
        code: 'CLOUD_CONSENT_REQUIRED',
      });
    }

    if (!isConfigured()) {
      return res.status(503).json({
        error: 'The cloud composer lane is not configured on this server.',
        code: 'AI_NOT_CONFIGURED',
      });
    }

    const rawChair = typeof body.chair === 'string' ? body.chair.trim().toLowerCase() : '';
    let spec: ChairSpec | undefined;
    let chairForBrief: Chair | undefined;
    if (isChair(rawChair)) {
      chairForBrief = rawChair;
      spec = CHAIR_SPECS[rawChair];
    } else if (rawChair === 'vocals' || rawChair === 'vocal') {
      spec = {
        role: 'melody',
        range: [48, 79],
        polyphonic: false,
        hint: 'the sung vocal melody (one note per syllable, stressed syllables on strong beats)',
      };
    } else if (isPartRole(rawChair)) {
      spec = {
        role: rawChair,
        range: ROLE_RANGE[rawChair],
        polyphonic: rawChair === 'harmony' || rawChair === 'pad' || rawChair === 'arp',
        hint: `the ${rawChair} part`,
      };
    }

    if (!spec) {
      return res.status(400).json({
        error: `Unknown chair "${body.chair ?? ''}". Expected one of: ${VALID_CHAIRS.join(', ')}.`,
      });
    }

    // Resolve `SongBrief` or pre-rendered `briefGrounding` text without inventing a second grounding.
    let brief: SongBrief | undefined;
    if (isSongBrief(body.brief)) {
      brief = body.brief;
    } else if (typeof body.prompt === 'string' && body.prompt.trim()) {
      brief = compileSongBrief(parseSongPrompt(body.prompt));
    } else if (
      typeof body.brief === 'string' &&
      body.brief.trim() &&
      !body.brief.trimStart().startsWith('STYLE:')
    ) {
      brief = compileSongBrief(parseSongPrompt(body.brief));
    }

    const rawSectionInput = body.section ?? body.sectionId;
    const resolvedSection = brief ? resolveSectionFromBrief(brief, rawSectionInput) : undefined;
    if (brief && rawSectionInput !== undefined && !resolvedSection) {
      return res.status(400).json({
        error: `Section "${String(rawSectionInput)}" was not found in the brief.`,
      });
    }

    let grounding: string;
    if (brief) {
      grounding = briefGrounding(brief, {
        chair: chairForBrief,
        sectionId: resolvedSection?.id,
      });
    } else {
      const provided =
        typeof body.grounding === 'string'
          ? body.grounding
          : typeof body.briefGrounding === 'string'
            ? body.briefGrounding
            : typeof body.brief === 'string'
              ? body.brief
              : '';
      if (!provided.trim()) {
        return res.status(400).json({
          error: 'Provide a compiled `brief`, raw `prompt`, or `briefGrounding` text.',
        });
      }
      grounding = provided.trim();
    }

    if (grounding.length > 24_000) {
      return res.status(400).json({ error: 'Brief grounding exceeds maximum length (24,000 chars).' });
    }

    // Resolve bar window (1-based bar numbers matching `briefGrounding` and `noteLines.ts`).
    let firstBar1 = 1;
    let barCount = 8;
    let beatsPerBar = 4;
    let meter: [number, number] = [4, 4];
    let bpm = 120;
    let key = 'C major';
    let sectionLabel: string | undefined;
    let chordsPerBar: string[][] | undefined;

    if (brief) {
      meter = brief.meter;
      beatsPerBar = brief.beatsPerBar;
      bpm = brief.bpm;
      key = brief.keyName;
      if (resolvedSection) {
        firstBar1 = resolvedSection.startBar + 1;
        barCount = resolvedSection.bars;
        sectionLabel = resolvedSection.label;
        chordsPerBar = resolvedSection.chords;
      } else {
        firstBar1 = 1;
        barCount = Math.min(16, Math.max(1, brief.totalBars));
      }
    } else {
      const parsedMeta = parseMeterAndTempoFromGrounding(grounding);
      meter = parsedMeta.meter;
      beatsPerBar = parsedMeta.beatsPerBar;
      bpm = parsedMeta.bpm;
      key = parsedMeta.key;
      const sectionHint = typeof rawSectionInput === 'string' ? rawSectionInput : undefined;
      sectionLabel = sectionHint;
      const win = parseBarWindowFromGrounding(grounding, sectionHint);
      if (win) {
        firstBar1 = win.startBar1;
        barCount = win.count;
      }
    }

    // Explicit `bars` override from request body (`bars: 8` or `bars: [startBar1, endBar1]` or `{ startBar, bars }`).
    if (typeof body.bars === 'number' && Number.isFinite(body.bars)) {
      if (body.bars < 1 || body.bars > 64) {
        return res.status(400).json({ error: '`bars` must be between 1 and 64.' });
      }
      barCount = Math.round(body.bars);
    } else if (
      Array.isArray(body.bars) &&
      body.bars.length === 2 &&
      Number.isFinite(Number(body.bars[0])) &&
      Number.isFinite(Number(body.bars[1]))
    ) {
      const b0 = Math.round(Number(body.bars[0]));
      const b1 = Math.round(Number(body.bars[1]));
      if (b0 < 1 || b1 < b0 || b1 - b0 + 1 > 64) {
        return res.status(400).json({ error: '`bars` range [startBar, endBar] must be 1-based and span 1–64 bars.' });
      }
      firstBar1 = b0;
      barCount = b1 - b0 + 1;
    } else if (body.bars && typeof body.bars === 'object' && !Array.isArray(body.bars)) {
      const startB = Number((body.bars as { startBar?: unknown }).startBar);
      const countB = Number((body.bars as { bars?: unknown; count?: unknown }).bars ?? (body.bars as { count?: unknown }).count);
      if (Number.isFinite(startB) && startB >= 1) firstBar1 = Math.round(startB);
      if (Number.isFinite(countB)) {
        if (countB < 1 || countB > 64) {
          return res.status(400).json({ error: '`bars.bars` must be between 1 and 64.' });
        }
        barCount = Math.round(countB);
      }
    }

    const lastBar1 = firstBar1 + barCount - 1;
    const ctx = buildDirectComposeContext({
      firstBar1,
      barCount,
      beatsPerBar,
      meter,
      bpm,
      key,
      role: spec.role,
      chair: rawChair,
      sectionLabel,
      chordsPerBar,
    });

    const { system, user } = buildDirectWritePrompt({
      grounding,
      chair: rawChair,
      spec,
      firstBar1,
      lastBar1,
      beatsPerBar,
    });

    const usageRecords: GeminiUsage[] = [];
    const model = laneModel(CHORA_DIRECT_MODEL_ENV);
    const lane: LaneFn =
      deps.lane ??
      createGeminiLane({
        model,
        temperature: 0.45,
        onUsage: (u) => usageRecords.push(u),
      });

    const maxTokens = Math.min(4096, Math.max(600, barCount * 140));
    let rawOutput: string;
    try {
      rawOutput = await lane(system, user, maxTokens, { temperature: 0.45 });
    } catch (err: any) {
      return res.status(502).json({
        error: 'The cloud composer lane could not write this part right now.',
        detail: err?.message ? String(err.message).slice(0, 240) : undefined,
      });
    }

    const notes: ComposedNote[] = parseNoteLines(rawOutput, ctx);
    if (!notes.length) {
      return res.status(422).json({
        error: `The cloud model returned no valid note lines inside bars ${firstBar1}–${lastBar1}.`,
        code: 'NO_VALID_NOTE_LINES',
      });
    }

    const lines = toLines(ctx, notes);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      chair: rawChair,
      role: spec.role,
      sectionId: resolvedSection?.id ?? (typeof rawSectionInput === 'string' ? rawSectionInput : undefined),
      bars: {
        startBar: firstBar1,
        endBar: lastBar1,
        count: barCount,
        beatsPerBar,
      },
      lines,
      text: lines.join('\n'),
      notes,
      model,
      usage: usageRecords.length ? summarizeUsage(usageRecords) : null,
    });
  });

  return router;
}
