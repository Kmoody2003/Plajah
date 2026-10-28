// Sound-type classification from names and paths ("Kick Zap 2.wav", "Drums/Snare/…"), and the
// Maschine-style layout a loose folder of one-shots gets: kicks bottom-left, then bass, snares and
// claps, hats, percussion, then FX and voice on the top row — the same shape as MEKA's starter kit.

import type { SampleCategory } from './types';

const RULES: [SampleCategory, RegExp][] = [
  ['loop', /\b(loops?|bpm|\d{2,3}\s?bpm|break(beat)?s?|groove)\b/i],
  ['hat-open', /\b(open\s?(hi-?\s?)?hats?|ohh?|o\.?hat|hh\s?open|open\s?hh|hat\s?open)\b/i],
  ['hat-closed', /\b(closed\s?(hi-?\s?)?hats?|chh?|c\.?hat|hh\s?closed|closed\s?hh|hat\s?closed|pedal\s?hat)\b/i],
  ['hat', /\b((hi-?\s?)?hats?|hh|shaker|shkr)\b/i],
  ['kick', /\b(kicks?|kik|kck|bd|bass\s?drum|bassdrum)\b/i],
  ['snare', /\b(snares?|snr|sd|rim(shot)?s?|sidestick)\b/i],
  ['clap', /\b(claps?|clp|snaps?)\b/i],
  ['cymbal', /\b(crash|ride|cymbals?|cym|china|splash)\b/i],
  ['tom', /\b(toms?|floor\s?tom|tom\s?(hi|lo|mid))\b/i],
  ['bass', /\b(808s?|sub|bass|reese)\b/i],
  ['vocal', /\b(vox|vocals?|voice|chants?|adlibs?|shouts?)\b/i],
  ['fx', /\b(fx|sfx|risers?|sweeps?|impacts?|noise|reverse|downlifters?|uplifters?|zaps?|lasers?)\b/i],
  ['perc', /\b(perc(ussion)?|congas?|bongos?|cowbells?|clave|tamb(ourine)?|tambo|blocks?|woodblock|triangle|guiro|cabasa|timbales?|toms?)\b/i],
];

/** Classify by file name first, then by the folders above it (an "Snare/" folder of oddly-named files). */
export function classifySample(path: string): SampleCategory {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const file = (parts.pop() || '').replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ');
  const byName = RULES.find(([, re]) => re.test(file))?.[0];
  // A strong name match wins; "FX"-ish words ("Kick Zap") yield to a drum folder above them.
  if (byName && byName !== 'fx') return byName;
  for (let i = parts.length - 1; i >= Math.max(0, parts.length - 3); i--) {
    const dir = parts[i].replace(/[_\-.]+/g, ' ');
    const byDir = RULES.find(([, re]) => re.test(dir))?.[0];
    if (byDir && byDir !== 'loop') return byDir;
  }
  return byName ?? 'other';
}

// Preferred pad slots per category, bottom row first (Maschine pad 1 = index 0 = bottom-left).
const SLOT_PREFS: Partial<Record<SampleCategory, number[]>> = {
  kick: [0, 1],
  bass: [2, 3],
  snare: [4, 6, 7],
  clap: [5, 7, 6],
  'hat-closed': [8, 10],
  'hat-open': [9, 11],
  hat: [8, 10, 9, 11],
  perc: [12, 13, 7],
  tom: [13, 12],
  cymbal: [14, 11],
  fx: [14, 15],
  vocal: [15, 14],
};

/** Lay a folder of sounds out across 16 pads (overflow spills into later Groups in file order). */
export function layoutFolderKit<T extends { path: string }>(files: T[]): { file: T; slot: number; category: SampleCategory }[] {
  const items = files.map((file) => ({ file, category: classifySample(file.path) }));
  const taken = new Set<number>();
  const out: { file: T; slot: number; category: SampleCategory }[] = [];
  const rest: typeof items = [];
  for (const it of items) {
    const prefs = SLOT_PREFS[it.category] || [];
    const slot = prefs.find((s) => !taken.has(s));
    if (slot === undefined) { rest.push(it); continue; }
    taken.add(slot);
    out.push({ ...it, slot });
  }
  let next = 0;
  for (const it of rest) {
    while (taken.has(next)) next++;
    taken.add(next);
    out.push({ ...it, slot: next });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

/** Does a folder of files look like a drum kit (several kinds of drum), not a category folder? */
export function looksLikeKit(paths: string[]): boolean {
  if (paths.length < 3 || paths.length > 64) return false;
  const kinds = new Set(paths.map(classifySample).filter((c) => c !== 'other' && c !== 'loop'));
  const drumKinds = [...kinds].filter((c) => c === 'kick' || c === 'snare' || c === 'clap' || c.startsWith('hat'));
  return kinds.size >= 3 && drumKinds.length >= 2;
}

export const CATEGORY_COLOR: Record<SampleCategory, string> = {
  kick: '#FF8C00', bass: '#D40055', snare: '#00DAF3', clap: '#00DAF3',
  'hat-closed': '#F5F0FA', 'hat-open': '#F5F0FA', hat: '#F5F0FA', cymbal: '#E8E2A8',
  tom: '#FFB86B', perc: '#D0BCFF', fx: '#9B7BFF', vocal: '#FF6FB5', loop: '#6FE3A1', other: '#B9B4C4',
};

export const CATEGORY_LABEL: Record<SampleCategory, string> = {
  kick: 'Kick', snare: 'Snare', clap: 'Clap', 'hat-closed': 'Closed Hat', 'hat-open': 'Open Hat', hat: 'Hi-Hat',
  cymbal: 'Cymbal', tom: 'Tom', perc: 'Perc', bass: 'Bass', fx: 'FX', vocal: 'Vocal', loop: 'Loop', other: 'Other',
};
