// progressionToClip — turn a progression from the repository into a playable MIDI clip (one bar per
// chord, sustained), voiced into absolute MIDI notes. Pure + testable; the Progression Browser and the
// Virtual Composer both use it. See docs/MELOS_COUNCIL_AND_COMPOSER.md (Composer P1).

import { CHORDS, realiseProgression, type DiatonicDegree } from '../theory';
import { getProgression } from '../progressionRepo';
import { grooveUid, type NoteEvent, type TimelineClip } from '../beats/grooveDoc';

const DEFAULT_BAR_BEATS = 4;

export interface ProgressionClipOpts {
  seventh?: boolean;      // 7th chords instead of triads
  baseMidi?: number;      // MIDI note the root sits near (default 48 = C3)
  barBeats?: number;      // beats per chord (default 4)
  startBeats?: number;    // where the clip starts on the track
  velocity?: number;      // 1–127 (default 90)
}

/** Voice one diatonic degree into absolute MIDI notes: the chord's intervals over baseMidi+rootPc. */
function voiceDegree(deg: DiatonicDegree, baseMidi: number, seventh: boolean): number[] {
  const chord = CHORDS.find((c) => c.id === deg.chordId);
  // Fall back to a plain triad / 7th if the chord id isn't in the catalog.
  const intervals = chord?.intervals?.length ? chord.intervals : (seventh ? [0, 4, 7, 10] : [0, 4, 7]);
  return intervals.map((iv) => baseMidi + deg.rootPc + iv);
}

/** Build a MIDI clip from a progression id in a key (rootPc 0=C…11=B). Returns null if unknown id. */
export function progressionToClip(progId: string, rootPc: number, opts: ProgressionClipOpts = {}): TimelineClip | null {
  const prog = getProgression(progId);
  if (!prog) return null;
  const seventh = !!opts.seventh;
  const baseMidi = opts.baseMidi ?? 48;
  const barBeats = opts.barBeats ?? DEFAULT_BAR_BEATS;
  const vel = Math.max(1, Math.min(127, opts.velocity ?? 90));
  const degrees = realiseProgression(prog, ((rootPc % 12) + 12) % 12, seventh);
  const notes: NoteEvent[] = [];
  degrees.forEach((deg, i) => {
    const start = i * barBeats;
    for (const midi of voiceDegree(deg, baseMidi, seventh)) {
      notes.push({ id: grooveUid(), startBeats: start, lengthBeats: barBeats * 0.96, key: midi, vel });
    }
  });
  return { id: grooveUid(), startBeats: opts.startBeats ?? 0, lengthBeats: degrees.length * barBeats, notes };
}

/** The roman-numeral / chord-symbol preview for a progression in a key — for the browser's chord chips. */
export function progressionChords(progId: string, rootPc: number, seventh = false): DiatonicDegree[] {
  const prog = getProgression(progId);
  return prog ? realiseProgression(prog, ((rootPc % 12) + 12) % 12, seventh) : [];
}
