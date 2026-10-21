import { nameToPc, pcName } from '../theory';

export interface EnsemblePlan {
  bars: number; seconds: number; summary: string; chords: string[];
  sections: Array<{ title: string; startBar: number; bars: number; direction: string; dynamic: 'p' | 'mp' | 'mf' | 'f' }>;
}

/** Treat generated form as untrusted data; exact coverage is required before DAW insertion. */
export function validateEnsemblePlan(raw: any, base: EnsemblePlan): EnsemblePlan {
  if (!Array.isArray(raw?.chords) || raw.chords.length !== base.bars || raw.chords.some((c: unknown) =>
    typeof c !== 'string' || c.length > 12 || !/^[A-G][#b]?[a-zA-Z0-9#b()+/\-]{0,24}$/.test(c))) throw new Error('The director returned an invalid chord map');
  if (!Array.isArray(raw.sections) || !raw.sections.length || raw.sections.length > 8) throw new Error('The director returned an invalid song form');
  const text = (value: unknown, max: number) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('The director returned an invalid section description');
    return value.trim();
  };
  let end = 0;
  const sections = raw.sections.map((s: any) => {
    if (!Number.isInteger(s?.startBar) || !Number.isInteger(s?.bars) || s.startBar !== end || s.bars < 1 || s.startBar + s.bars > base.bars) throw new Error('The director must cover each bar exactly once');
    end += s.bars;
    if (!['p', 'mp', 'mf', 'f'].includes(s.dynamic)) throw new Error('The director returned an invalid dynamic marking');
    return { title: text(s.title, 80), startBar: s.startBar, bars: s.bars,
      direction: text(s.direction, 300), dynamic: s.dynamic as 'p' | 'mp' | 'mf' | 'f' };
  });
  if (end !== base.bars) throw new Error('The director left bars unplanned');
  return { ...base, chords: [...raw.chords], sections,
    summary: `${base.summary} Director concept: ${text(raw.concept, 500)}` };
}

/** Explicit rule-based form; this does not pretend a reasoning model ran. */
export function buildEnsemblePlan(input: {
  prompt: string; bpm: number; keySignature: string; regionBeats: number; startBeats: number; allowShort?: boolean;
}): EnsemblePlan {
  if (!input.prompt.trim() || input.prompt.length > 4000) throw new Error('Describe the music in at most 4000 characters.');
  if (!Number.isFinite(input.bpm) || input.bpm < 30 || input.bpm > 300) throw new Error('Tempo must be between 30 and 300 BPM.');
  if (!Number.isFinite(input.startBeats) || input.startBeats < 0) throw new Error('Choose a valid region start.');
  const bars = input.regionBeats / 4;
  const seconds = input.regionBeats * 60 / input.bpm;
  if (!Number.isInteger(bars) || bars < 1 || bars > 128 || seconds < (input.allowShort ? 0.1 : 10) || seconds > 360) {
    throw new Error('Choose whole bars lasting 10–360 seconds (at most 128 bars).');
  }
  const key = input.keySignature.match(/^([A-G](?:#|b)?)\s+(major|minor)$/i);
  if (!key) throw new Error('Use a key such as D Minor or F# Major.');
  const root = nameToPc(key[1][0].toUpperCase() + key[1].slice(1));
  const minor = key[2].toLowerCase() === 'minor';
  const cycle = minor ? [[0, 'm'], [8, ''], [3, ''], [10, '']] as const : [[0, ''], [7, ''], [9, 'm'], [5, '']] as const;
  const chords = Array.from({ length: bars }, (_, i) => {
    const [interval, quality] = cycle[i % cycle.length];
    return pcName(root + interval) + quality;
  });
  if (bars >= 4) { chords[bars - 2] = pcName(root + 7) + '7'; chords[bars - 1] = pcName(root) + (minor ? 'm' : ''); }
  const templates: Array<{ title: string; direction: string; dynamic: 'p' | 'mp' | 'mf' | 'f' }> = bars < 8
    ? [{ title: 'Theme', direction: 'Establish a motif, develop it and resolve the final phrase.', dynamic: 'mf' }]
    : [
      { title: 'Intro', direction: 'Introduce the hook sparsely; leave rhythmic and spectral space.', dynamic: 'mp' },
      { title: 'Verse', direction: 'Develop the motif over a steady pocket; keep the lead clear.', dynamic: 'mf' },
      { title: 'Chorus', direction: 'Return the hook with a register and energy lift, without doubling every part.', dynamic: 'f' },
      { title: 'Outro', direction: 'Reduce density, recall the opening motif and resolve the cadence.', dynamic: 'mp' },
    ];
  const sections = templates.map((t, i) => {
    const startBar = Math.floor(i * bars / templates.length);
    return { ...t, startBar, bars: Math.floor((i + 1) * bars / templates.length) - startBar };
  });
  return { bars, seconds, chords, sections,
    summary: `Shared arrangement: ${bars} bars, 4/4, ${input.bpm} BPM, ${input.keySignature}. Keep a recognizable motif across sections, contrasting density, voice-led harmony and a deliberate final cadence.` };
}
