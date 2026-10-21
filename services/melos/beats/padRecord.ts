// Melos Beats — live pad recording (Maschine / MPC record): a pad hit while the transport runs and
// record is armed lands as a step in the pattern that is playing for that pad's Group.
//
//   Pattern mode — the Group's pattern in the playing set (a legacy kit-wide pattern takes any pad).
//   Song mode    — the pattern clip under the playhead on a pattern track for that Group.
// Record quantize ON snaps to the 16th; OFF keeps the timing as the step's micro offset (the
// scheduler plays `micro`), so a loose take stays loose. Overdub: an existing step's velocity is
// replaced, nothing else is erased.

import type { GrooveDoc, Pattern } from './grooveDoc';
import { padGroup, patternGroup } from './songSections';

export interface PadHitIn { padIdx: number; vel: number; beat: number; mode: 'pattern' | 'song' }

export interface RecordTarget { patternId: string; posBeats: number; lenSteps: number }

const STEPS_PER_BEAT = 4;

/** Does a pattern accept hits from this pad? (its Group, or a legacy kit-wide pattern) */
const accepts = (p: Pattern, padIdx: number) =>
  p.groupIdx === undefined ? true : patternGroup(p) === padGroup(padIdx);

/** Where a hit lands, or null when no playing pattern takes this pad. */
export function recordTarget(doc: GrooveDoc, hit: PadHitIn, playingIds: string[]): RecordTarget | null {
  if (hit.mode === 'pattern') {
    const playing = playingIds.map((id) => doc.patterns.find((p) => p.id === id)).filter((p): p is Pattern => !!p);
    // Prefer the pad's own Group pattern over a legacy kit-wide one.
    const pat = playing.find((p) => p.groupIdx !== undefined && accepts(p, hit.padIdx)) ?? playing.find((p) => accepts(p, hit.padIdx));
    if (!pat) return null;
    const lenBeats = pat.length / STEPS_PER_BEAT;
    return { patternId: pat.id, posBeats: ((hit.beat % lenBeats) + lenBeats) % lenBeats, lenSteps: pat.length };
  }
  if (hit.beat < 0) return null;
  const anySolo = doc.arrangement.some((t) => t.solo);
  let legacy: RecordTarget | null = null;
  for (const track of doc.arrangement) {
    if (track.kind !== 'pattern' || track.foreign || track.mute || (anySolo && !track.solo)) continue;
    for (const clip of track.clips) {
      if (!clip.patternId || hit.beat < clip.startBeats - 1e-9 || hit.beat >= clip.startBeats + clip.lengthBeats) continue;
      const pat = doc.patterns.find((p) => p.id === clip.patternId);
      if (!pat || !accepts(pat, hit.padIdx)) continue;
      const lenSteps = Math.max(1, Math.min(pat.length, Math.round(clip.padLens?.[hit.padIdx] ?? pat.length)));
      const lenBeats = lenSteps / STEPS_PER_BEAT;
      const into = hit.beat - clip.startBeats + (clip.contentOffsetBeats ?? 0);
      const t = { patternId: pat.id, posBeats: ((into % lenBeats) + lenBeats) % lenBeats, lenSteps };
      // The pad's own Group pattern wins over a legacy kit-wide one playing at the same time.
      if (pat.groupIdx !== undefined) return t;
      legacy ??= t;
    }
  }
  return legacy;
}

/** Write a hit into the doc. Returns the pattern + step written, or null when nothing took it. */
export function recordPadHit(
  doc: GrooveDoc, hit: PadHitIn, playingIds: string[], quantize: boolean,
): { patternId: string; step: number } | null {
  const t = recordTarget(doc, hit, playingIds);
  if (!t) return null;
  const pat = doc.patterns.find((p) => p.id === t.patternId);
  if (!pat) return null;
  const exact = t.posBeats * STEPS_PER_BEAT;
  const nearest = Math.round(exact);
  const step = ((nearest % t.lenSteps) + t.lenSteps) % t.lenSteps;
  const micro = quantize ? 0 : Math.max(-0.5, Math.min(0.5, exact - nearest));
  const row = (pat.steps[hit.padIdx] ??= {});
  const prev = row[step];
  row[step] = { ...(prev ?? {}), v: Math.max(1, Math.min(127, Math.round(hit.vel))) };
  if (Math.abs(micro) > 0.02) row[step].micro = +micro.toFixed(3); else delete row[step].micro;
  return { patternId: pat.id, step };
}
