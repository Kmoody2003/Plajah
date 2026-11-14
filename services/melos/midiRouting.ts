// Hardware MIDI & keyboard focus resolution across Chora views.
//
// Centralizes which instrument track receives live MIDI notes, CCs, pitch bend, sustain, and
// hardware macros so Timeline, MEKA, Glass, Mixer, and open instrument windows never drop notes
// or route C1..D#2 into drum pads when an instrument is focused or waiting in Timeline.

import { grooveUid, type ArrangeTrack, type GrooveDoc, type NoteEvent } from './beats/grooveDoc';
import { songTime } from './beats/tempoMap';
import { contentPosAt } from './beats/clipContent';

export type MidiFocusView = 'machine' | 'glass' | 'timeline' | 'mixer' | 'project';

export interface MidiRoutingInput {
  doc: Pick<GrooveDoc, 'arrangement' | 'kit'>;
  view: MidiFocusView;
  selectedPad: number;
  openInstrumentId: string | null;
}

export interface MidiRoutingState {
  /** Explicitly armed Timeline instrument track (`!padOwned`). */
  armedTrack: ArrangeTrack | null;
  /** Currently open instrument panel track (Timeline or pad-owned). */
  openTrack: ArrangeTrack | null;
  /** Selected MEKA instrument pad's backing track when no modal instrument panel is open. */
  padTrack: ArrangeTrack | null;
  /** First un-owned Timeline instrument track (fallback auto-arm target). */
  firstTimelineTrack: ArrangeTrack | null;
  /** Primary instrument track that should receive incoming live notes and wheels. */
  targetTrack: ArrangeTrack | null;
  /**
   * True when MIDI note numbers (including C1..D#2 / 36..51) should resolve as chromatic notes
   * for an instrument rather than defaulting to drum pads 0..15.
   */
  instrumentArmed: boolean;
  /** True when grid controllers (Maschine / Jam pads) should play chromatic instrument notes. */
  gridPlaysKeys: boolean;
  /** Instrument track whose macros hardware knobs should control directly, if any. */
  macroTrack: ArrangeTrack | null;
}

export function resolveMidiRouting({
  doc,
  view,
  selectedPad,
  openInstrumentId,
}: MidiRoutingInput): MidiRoutingState {
  const inMeka = view === 'machine';
  const armedTrack = doc.arrangement.find((t) => t.kind === 'instrument' && t.armed && !t.padOwned) ?? null;
  const openTrack = openInstrumentId
    ? doc.arrangement.find((t) => t.id === openInstrumentId && t.kind === 'instrument') ?? null
    : null;
  const firstTimelineTrack = doc.arrangement.find((t) => t.kind === 'instrument' && !t.padOwned) ?? null;

  const selPad = doc.kit[selectedPad];
  // An explicitly opened instrument panel owns focus ahead of the selected MEKA pad.
  const padTrack = inMeka && !openTrack && selPad?.source === 'instrument' && selPad.instrumentTrackId
    ? doc.arrangement.find((t) => t.id === selPad.instrumentTrackId && t.kind === 'instrument') ?? null
    : null;

  const targetTrack = openTrack ?? padTrack ?? armedTrack ?? firstTimelineTrack;
  const timelineHasInstrument = view === 'timeline' && firstTimelineTrack !== null;
  const instrumentArmed = !!(openTrack ?? padTrack ?? armedTrack) || timelineHasInstrument;
  const gridPlaysKeys = !inMeka;
  const macroTrack = openTrack ?? (!inMeka ? (armedTrack ?? (view === 'timeline' ? firstTimelineTrack : null)) : null);

  return {
    armedTrack,
    openTrack,
    padTrack,
    firstTimelineTrack,
    targetTrack,
    instrumentArmed,
    gridPlaysKeys,
    macroTrack,
  };
}

export interface RecordedNote {
  /** Every note the press played, when auto-chord made it more than one. */
  keys?: number[];
  key: number;
  vel: number;
  startBeats: number;
}

/**
 * Write a captured note into a clip on an instrument track, creating and bar-aligning the clip
 * if needed so neither hardware MIDI nor QWERTY recording drops notes.
 */
export function commitRecordedNote(
  trackId: string,
  rec: RecordedNote,
  endBeats: number,
  onMutate: (fn: (d: GrooveDoc) => void) => void,
): void {
  if (rec.keys && rec.keys.length > 1) {
    for (const key of rec.keys) commitRecordedNote(trackId, { ...rec, key, keys: undefined }, endBeats, onMutate);
    return;
  }
  const lengthBeats = Math.max(0.0625, endBeats - rec.startBeats);
  onMutate((d) => {
    const track = d.arrangement.find((t) => t.id === trackId);
    if (!track || track.kind !== 'instrument') return;

    let clip = track.clips.find(
      (c) => rec.startBeats >= c.startBeats - 1e-9 && rec.startBeats < c.startBeats + c.lengthBeats,
    );
    if (!clip) {
      const bar = songTime(d).meter.at(rec.startBeats);
      clip = { id: grooveUid(), startBeats: bar.startBeat, lengthBeats: bar.lenBeats, notes: [] };
      track.clips.push(clip);
    }
    if (!clip.notes) clip.notes = [];

    const note: NoteEvent = {
      id: grooveUid(),
      startBeats: contentPosAt(clip, rec.startBeats) ?? rec.startBeats - clip.startBeats,
      lengthBeats,
      key: rec.key,
      vel: rec.vel,
    };
    clip.notes.push(note);

    if (!clip.loop) {
      const relEnd = note.startBeats + lengthBeats;
      if (relEnd > clip.lengthBeats) {
        const barLen = songTime(d).meter.at(clip.startBeats).lenBeats;
        clip.lengthBeats = Math.ceil(relEnd / barLen) * barLen;
      }
    }
  });
}
