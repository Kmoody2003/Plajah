// breakdownToTracks — turn a Chora Track Breakdown (its per-role analysed notes) into Melos instrument
// tracks: one track per role (Melody/Harmony/Bass/Accent), each a MIDI clip. Composer P3 — "use Chora's
// breakdown to score parts for instruments in Melos". Pure + testable; the caller creates the actual
// instrument tracks (instrumentFactory) and pushes these clips.
import type { NoteEvent } from '../beats/grooveDoc';
import type { InstrumentType } from '../beats/grooveDoc';

// Mirror of TrackBreakdownModal's ScoreNote / StoredBreakdown (kept local so a service doesn't import a
// component). Only the fields we need.
export interface BreakdownScoreNote { midi: number; role: 'MELODY' | 'HARMONY' | 'BASS' | 'ACCENT'; beat: number; }
export interface BreakdownLike {
  theory?: { tempo?: number; key?: string; notes?: BreakdownScoreNote[] };
  trackTitle?: string; trackArtist?: string;
}

export interface ScoredTrack { role: string; name: string; instrumentType: InstrumentType; notes: NoteEvent[]; }

const ROLE_ORDER: BreakdownScoreNote['role'][] = ['MELODY', 'HARMONY', 'BASS', 'ACCENT'];
const ROLE_INSTRUMENT: Record<string, InstrumentType> = { MELODY: 'onda', HARMONY: 'onda', BASS: 'bajo', ACCENT: 'onda' };
const nid = () => 'n' + Math.random().toString(36).slice(2, 9);

/** Length of a note = gap to the next note at a LATER beat in the same role (so stacked chord notes all
 *  sustain to the next change), clamped to a musical range; the last note gets a default. */
function durations(sorted: BreakdownScoreNote[]): number[] {
  return sorted.map((n, i) => {
    let j = i + 1;
    while (j < sorted.length && sorted[j].beat <= n.beat) j++;
    const gap = j < sorted.length ? sorted[j].beat - n.beat : 2;
    return Math.min(4, Math.max(0.5, gap));
  });
}

/** Group a breakdown's notes into per-role instrument tracks + clips. */
export function breakdownToTracks(bd: BreakdownLike): { tempo: number; key?: string; tracks: ScoredTrack[] } {
  const all = (bd?.theory?.notes || []).filter((n) => n && Number.isFinite(n.midi) && Number.isFinite(n.beat));
  const first = all.length ? Math.min(...all.map((n) => n.beat)) : 0;
  const tracks: ScoredTrack[] = [];
  for (const role of ROLE_ORDER) {
    const sorted = all.filter((n) => n.role === role).sort((a, b) => a.beat - b.beat);
    if (!sorted.length) continue;
    const durs = durations(sorted);
    const notes: NoteEvent[] = sorted.map((n, i) => ({
      id: nid(),
      startBeats: Math.max(0, n.beat - first),
      lengthBeats: durs[i],
      key: Math.max(0, Math.min(127, Math.round(n.midi))),
      vel: 90,
    }));
    tracks.push({ role, name: role.charAt(0) + role.slice(1).toLowerCase(), instrumentType: ROLE_INSTRUMENT[role], notes });
  }
  return { tempo: bd?.theory?.tempo || 120, key: bd?.theory?.key, tracks };
}
