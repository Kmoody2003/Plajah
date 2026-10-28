// Put a multisample instrument (a KERA track carrying a serialized program) into the song — onto
// a MEKA pad, or as a Timeline instrument track. Pure doc mutation, like applyKit.ts: the caller
// builds the track (instrumentFactory.makeInstrumentTrack('kera', …)) and stores the program first.

import type { ArrangeTrack, GrooveDoc } from '../grooveDoc';
import { detachPadInstrument } from '../channelOps';

const KERA_COLOR = '#00DAF3';

/** Load the instrument onto pad `padIdx`, replacing whatever it held. Returns the track id. */
export function instrumentOnPad(doc: GrooveDoc, padIdx: number, track: ArrangeTrack, name: string): string | null {
  const pad = doc.kit[padIdx];
  if (!pad) return null;
  detachPadInstrument(doc, padIdx);
  // A pad's instrument is a pad-owned track: hidden from the arranger, driven by the pad sequencer.
  track.armed = false;
  track.padOwned = true;
  track.padIndex = padIdx;
  track.name = name.slice(0, 40);
  doc.arrangement.push(track);
  pad.source = 'instrument';
  pad.instrumentTrackId = track.id;
  pad.sample = null;
  pad.empty = false;
  pad.mute = false;
  pad.name = name.slice(0, 18);
  pad.color = KERA_COLOR;
  pad.pitchSemis = 0;
  if (pad.instrumentNote === undefined) pad.instrumentNote = 60;
  return track.id;
}

/** Add the instrument as a new Timeline track, armed — disarming whatever was armed before. */
export function instrumentTrack(doc: GrooveDoc, track: ArrangeTrack, name: string): string {
  for (const t of doc.arrangement) if (t.kind === 'instrument') t.armed = false;
  track.name = name.slice(0, 40);
  track.armed = true;
  doc.arrangement.push(track);
  return track.id;
}
