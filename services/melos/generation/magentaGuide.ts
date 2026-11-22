import type { GrooveDoc } from '../beats/grooveDoc';
import { noteOccurrences } from '../beats/clipContent';
import { songTime } from '../beats/tempoMap';
import type { MagentaGuideNote } from './magentaRt';

/** Instrument tracks whose MIDI can steer a Magenta render. */
export function magentaGuideTracks(doc: GrooveDoc) {
  return doc.arrangement.filter(track => track.kind === 'instrument' && track.clips.some(clip => clip.notes?.length));
}

/**
 * Notes of one instrument track inside [startBeat, startBeat + seconds), in seconds from the
 * render start, with the song's tempo map applied (Magenta frames are wall-clock, 25 Hz).
 */
export function magentaGuideNotes(doc: GrooveDoc, trackId: string, startBeat: number, seconds: number): MagentaGuideNote[] {
  const track = doc.arrangement.find(t => t.id === trackId);
  if (!track) return [];
  const { tempo } = songTime(doc);
  const t0 = tempo.beatToSec(startBeat);
  const endBeat = tempo.secToBeat(t0 + seconds);
  const out: MagentaGuideNote[] = [];
  for (const clip of track.clips) {
    for (const occ of noteOccurrences(clip, startBeat, endBeat)) {
      const startSec = tempo.beatToSec(occ.songBeat) - t0;
      const lengthSec = Math.min(seconds - startSec, tempo.secBetween(occ.songBeat, occ.songBeat + occ.lengthBeats));
      if (startSec < 0 || lengthSec <= 0) continue;
      out.push({ startSec, lengthSec, key: Math.max(0, Math.min(127, Math.round(occ.note.key))) });
    }
  }
  return out.sort((a, b) => a.startSec - b.startSec).slice(0, 8000);
}
