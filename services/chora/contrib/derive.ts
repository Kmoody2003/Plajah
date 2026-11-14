// From the ledger to the sleeve: per-person contribution summaries and suggested credits. Pure.
//
// Suggestions, not verdicts. The ledger proves who touched what and when; what that is worth
// (a writer split, a producer point) is for the collaborators to agree between themselves.
// So derived credits never carry a split, and the evidence (counts, first/last time) rides along.

import type { Credit, CreditCategory } from '../../melos/beats/releaseDesk';
import type { ContribEntry, ContribKind } from './types';

export interface PersonContrib {
  uid: string;
  name: string;
  kinds: Partial<Record<ContribKind, number>>;
  /** Tracks they recorded/played on, with the instrument when known. */
  tracks: Record<string, { kinds: ContribKind[]; instrument?: string; inputs: string[]; playedBy?: string }>;
  firstAt: number;
  lastAt: number;
  devices: string[];
}

export function summarizeByPerson(entries: ReadonlyArray<ContribEntry>): PersonContrib[] {
  const people = new Map<string, PersonContrib>();
  for (const e of entries) {
    if (e.kind === 'sealed') continue;
    const p = people.get(e.uid) ?? { uid: e.uid, name: e.name, kinds: {}, tracks: {}, firstAt: e.at, lastAt: e.at, devices: [] };
    p.name = e.name || p.name;
    p.kinds[e.kind] = (p.kinds[e.kind] ?? 0) + e.count;
    p.firstAt = Math.min(p.firstAt, e.at);
    p.lastAt = Math.max(p.lastAt, e.at);
    if (e.origin?.device && !p.devices.includes(e.origin.device)) p.devices.push(e.origin.device);
    if (e.track) {
      const t = p.tracks[e.track] ??= { kinds: [], inputs: [] };
      if (!t.kinds.includes(e.kind)) t.kinds.push(e.kind);
      if (e.instrument) t.instrument = e.instrument;
      if (e.origin?.input && !t.inputs.includes(e.origin.input)) t.inputs.push(e.origin.input);
      if (e.kind === 'recorded' && e.origin?.performer) t.playedBy = e.origin.performerName || e.origin.performer;
    }
    people.set(e.uid, p);
  }
  return [...people.values()].sort((a, b) => a.firstAt - b.firstAt);
}

// Track names → the instrument a performer credit names. Falls back to the track's own name.
const INSTRUMENT_WORDS: [RegExp, string][] = [
  [/lead\s*vo|^vox|vocal/i, 'Lead Vocals'], [/back|bgv|harmony|choir/i, 'Backing Vocals'],
  [/guitar|gtr/i, 'Guitar'], [/bass/i, 'Bass'], [/drum|kit|perc/i, 'Drums'],
  [/piano|keys|rhodes|organ/i, 'Keyboards'], [/synth|pad|lead/i, 'Synthesizer'],
  [/string|violin|cello|viola/i, 'Strings'], [/horn|brass|sax|trumpet|trombone/i, 'Horns'],
];
const instrumentFor = (track: string, instrument?: string) => {
  for (const [re, label] of INSTRUMENT_WORDS) if (re.test(track)) return label;
  if (instrument === 'soma') return 'Percussion';
  return track;
};

const MIN = { notes: 8, beat: 4, sound: 3, mixed: 6, mastered: 2, arranged: 3 } as const;

/** Credits each person's ledger supports. Ids are stable (`ledger:<uid>:<role>`) so re-applying merges. */
export function suggestCredits(entries: ReadonlyArray<ContribEntry>): Credit[] {
  const out: Credit[] = [];
  const add = (p: PersonContrib, category: CreditCategory, role: string, instrument?: string) => {
    const id = `ledger:${p.uid}:${role}${instrument ? `:${instrument}` : ''}`;
    if (!out.some((c) => c.id === id)) out.push({ id, name: p.name, category, role, ...(instrument ? { instrument } : {}) });
  };
  for (const p of summarizeByPerson(entries)) {
    for (const [track, t] of Object.entries(p.tracks)) {
      if (t.kinds.includes('recorded') && !t.playedBy) add(p, 'performer', instrumentFor(track, t.instrument), instrumentFor(track, t.instrument));
    }
    // Takes a collaborator played on someone else's recorder: the performer credit is theirs.
    for (const e of entries) {
      const who = e.kind === 'recorded' ? e.origin?.performer : undefined;
      if (!who || e.uid !== p.uid) continue;
      const label = instrumentFor(e.track ?? '', e.instrument);
      const id = `ledger:${who}:${label}:${label}`;
      if (!out.some((c) => c.id === id)) out.push({ id, name: e.origin?.performerName || 'Collaborator', category: 'performer', role: label, instrument: label });
    }
    if (p.kinds.recorded) add(p, 'engineer', 'Recording Engineer');
    if ((p.kinds.lyrics ?? 0) > 0) add(p, 'writer', 'Lyricist');
    if ((p.kinds.notes ?? 0) >= MIN.notes) add(p, 'writer', 'Composer');
    if ((p.kinds.beat ?? 0) >= MIN.beat || (p.kinds.sound ?? 0) >= MIN.sound) add(p, 'producer', 'Producer');
    if ((p.kinds.notes ?? 0) >= MIN.notes || (p.kinds.beat ?? 0) >= MIN.beat) add(p, 'performer', 'Programming', 'Programming');
    if ((p.kinds.arranged ?? 0) >= MIN.arranged) add(p, 'writer', 'Arranger');
    if ((p.kinds.mixed ?? 0) >= MIN.mixed) add(p, 'engineer', 'Mixing Engineer');
    if ((p.kinds.mastered ?? 0) >= MIN.mastered) add(p, 'engineer', 'Mastering Engineer');
  }
  return out;
}

/** Merge suggestions into hand-entered credits: never overwrites, never duplicates a name+role. */
export function mergeCredits(existing: ReadonlyArray<Credit>, suggested: ReadonlyArray<Credit>): Credit[] {
  const key = (c: Credit) => `${c.name.trim().toLowerCase()}|${c.role.trim().toLowerCase()}`;
  const have = new Set(existing.map(key));
  return [...existing, ...suggested.filter((c) => !have.has(key(c)) && !existing.some((x) => x.id === c.id))];
}
