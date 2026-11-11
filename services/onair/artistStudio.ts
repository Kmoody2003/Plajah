// How a virtual artist makes and releases music on Plajah.
//
// The artist works in Chora with the same engines every creator has (MEKA, AURA, LYRA, KERA, SOMA,
// the Session Band, Note FX, the Mastering Desk, the Album Arranger). A release moves through fixed
// stages, and two of them always need a person: a producer signs off on the music, and the owner
// signs off on rights before anything is published. Nothing ships on the persona's say-so.
//
//   brief → sketch → arrange → produce → mix → master → producer-review → rights-check → scheduled → released
//
// Rights: persona releases are owned by Plajah, credited "AI-assisted — made in Chora", and go
// through the same Track Rights Clearance questions as any upload. No samples of real recordings
// and no sound-alike of a real singer.

import type { PersonaSheet } from './types';

export const RELEASE_STAGES = [
  'brief', 'sketch', 'arrange', 'produce', 'mix', 'master', 'producer-review', 'rights-check', 'scheduled', 'released',
] as const;
export type ReleaseStage = typeof RELEASE_STAGES[number];

/** Stages only a person may move a release out of. */
export const HUMAN_GATES: ReleaseStage[] = ['producer-review', 'rights-check'];

/** Which Chora tool does the work at each making stage. */
export const STAGE_TOOLS: Partial<Record<ReleaseStage, string[]>> = {
  sketch: ['meka', 'kera', 'band'],
  arrange: ['album-arranger', 'band', 'note-fx', 'harmony'],
  produce: ['meka', 'meka-drum-synth', 'meka-sampler', 'aura', 'lyra', 'kera', 'soma'],
  mix: ['airwindows'],
  master: ['mastering'],
};

export interface ReleaseCredits {
  artist: string;
  madeWith: string[];
  producer?: string;
  statement: 'AI-assisted — made in Chora';
  owner: 'Plajah';
}

export interface PersonaRelease {
  id: string;
  personaId: string;
  title: string;
  era: string;
  stage: ReleaseStage;
  bpm?: number;
  key?: string;
  /** Chora session/project id this release lives in. */
  choraProjectId?: string;
  credits: ReleaseCredits;
  approvals: { stage: ReleaseStage; by: string; at: number; note?: string }[];
  /** Rights answers (Track Rights Clearance). All must be true before rights-check passes. */
  rights: { noRealSamples: boolean; noSoundAlike: boolean; originalLyrics: boolean; ownerApproved: boolean };
  history: { from: ReleaseStage; to: ReleaseStage; at: number; by: string }[];
}

export function newRelease(p: PersonaSheet, title: string, era: string, id: string): PersonaRelease {
  if (p.kind !== 'artist' || !p.artist) throw new Error(`${p.id} is not an artist`);
  return {
    id, personaId: p.id, title, era, stage: 'brief',
    credits: { artist: p.stageName, madeWith: [...p.artist.choraTools], statement: 'AI-assisted — made in Chora', owner: 'Plajah' },
    approvals: [],
    rights: { noRealSamples: false, noSoundAlike: false, originalLyrics: false, ownerApproved: false },
    history: [],
  };
}

export type AdvanceResult = { ok: true; release: PersonaRelease } | { ok: false; reason: string };

/**
 * Moves a release to the next stage. `by` is 'persona' for the automated runtime or a person's uid.
 * Human gates refuse 'persona'; rights-check also needs every rights answer true.
 */
export function advance(r: PersonaRelease, by: string, now = Date.now(), note?: string): AdvanceResult {
  const i = RELEASE_STAGES.indexOf(r.stage);
  if (i < 0 || i === RELEASE_STAGES.length - 1) return { ok: false, reason: 'already released' };
  if (HUMAN_GATES.includes(r.stage) && by === 'persona') return { ok: false, reason: `${r.stage} needs a person to sign off` };
  if (r.stage === 'rights-check') {
    const missing = Object.entries(r.rights).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) return { ok: false, reason: `rights not cleared: ${missing.join(', ')}` };
  }
  const to = RELEASE_STAGES[i + 1];
  const next: PersonaRelease = {
    ...r,
    stage: to,
    approvals: HUMAN_GATES.includes(r.stage) ? [...r.approvals, { stage: r.stage, by, at: now, note }] : r.approvals,
    credits: r.stage === 'producer-review' ? { ...r.credits, producer: by } : r.credits,
    history: [...r.history, { from: r.stage, to, at: now, by }],
  };
  return { ok: true, release: next };
}

/** The Era 1 releases for an artist, straight from the sheet's working titles. */
export function eraOneReleases(p: PersonaSheet): PersonaRelease[] {
  const era = p.artist?.eraPlan[0];
  if (!era) return [];
  return era.workingTitles.map((t, i) => newRelease(p, t, era.era, `${p.id}-e1-${i + 1}`));
}
