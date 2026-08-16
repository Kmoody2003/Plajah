// One place that knows how to make an instrument track. Every view — Machine, Glass, Timeline,
// Mixer — adds instruments through this, so "add an instrument" means the same thing everywhere
// and a new instrument type is registered once rather than in four places.

import { grooveUid, type ArrangeTrack, type InstrumentType } from './grooveDoc';
import { newPatch, serializePatch } from '../instruments/onda/patch';

export interface InstrumentDef {
  type: InstrumentType | 'kera';
  name: string;
  /** One line under the name — what it is, in plain terms. */
  blurb: string;
  color: string;
  /** Built and playable now, vs announced but not yet. */
  ready: boolean;
}

/** The instrument choices shown FIRST — before any preset. Adding an instrument is choosing
 *  what kind of thing you want, not scrolling a preset list. */
export const INSTRUMENTS: InstrumentDef[] = [
  { type: 'onda', name: 'ONDA', blurb: 'Wavetable synth. Basses, leads, pads — anything you can shape.', color: '#B84DFF', ready: true },
  { type: 'kera', name: 'KERA', blurb: 'Sampler. Play SoundFonts, SFZ and your own recordings across the keys.', color: '#00DAF3', ready: true },
  { type: 'onda', name: 'FONDO', blurb: 'Bass synth. Focused, deep, sub-first. (Coming soon)', color: '#D40055', ready: false },
];

/**
 * Build an instrument track. Defaults to a fresh Init patch — the user asked to choose the
 * INSTRUMENT first, so a preset is an optional later step inside the panel, not a gate on
 * creation. Armed immediately because you want to play what you just added.
 */
export function makeInstrumentTrack(type: InstrumentType, count: number, presetPatch?: ReturnType<typeof serializePatch>, presetName?: string): ArrangeTrack {
  const label = presetName || (type === 'kera' ? `KERA ${count + 1}` : `ONDA ${count + 1}`);
  return {
    id: grooveUid(),
    kind: 'instrument',
    name: label,
    color: type === 'kera' ? '#00DAF3' : '#D0BCFF',
    mute: false, solo: false, gainDb: 0, pan: 0,
    clips: [],
    instrument: {
      type,
      // KERA ignores the patch (it plays a loaded program), but a valid ONDA patch keeps the
      // shared filter/envelope defaults sane and the serialize path uniform.
      patch: presetPatch || serializePatch(newPatch(label)),
      presetName,
    },
    armed: true,
    position: [0, 0, -1],
  };
}

/** Add an instrument track to the doc, disarming whatever was armed before. Returns its id. */
export function addInstrument(
  doc: { arrangement: ArrangeTrack[] },
  type: InstrumentType,
  presetPatch?: ReturnType<typeof serializePatch>,
  presetName?: string,
): string {
  for (const t of doc.arrangement) t.armed = false;
  const count = doc.arrangement.filter((t) => t.kind === 'instrument').length;
  const track = makeInstrumentTrack(type, count, presetPatch, presetName);
  doc.arrangement.push(track);
  return track.id;
}
