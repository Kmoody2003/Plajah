// One place that knows how to make an instrument track. Every view — Machine, Glass, Timeline,
// Mixer — adds instruments through this, so "add an instrument" means the same thing everywhere
// and a new instrument type is registered once rather than in four places.

import { grooveUid, firstEmptyPadIndex, addPadBank, type ArrangeTrack, type InstrumentType, type GrooveDoc } from './grooveDoc';
import { newPatch, serializePatch } from '../instruments/onda/patch';
import { newVelaPatch, serializeVelaPatch } from '../instruments/vela/patch';
import { newBajoPatch, serializeBajoPatch } from '../instruments/bajo/patch';
import { SUITE, SUITE_ORDER, presetsFor } from '../instruments/vela/suite';

/** True for any member of the meditation suite — they share a patch shape and an editor. */
export function isSuite(type: InstrumentType): type is 'vela' | 'cantus' | 'ison' | 'pneuma' {
  return type === 'vela' || type === 'cantus' || type === 'ison' || type === 'pneuma';
}

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
  // The meditation suite. Four entries because they are four instruments, even though they
  // share an engine — what makes an instrument an instrument is what you reach for it FOR.
  ...SUITE_ORDER.map((id) => ({
    type: id as InstrumentType,
    name: SUITE[id].name,
    blurb: SUITE[id].blurb,
    color: SUITE[id].accent,
    ready: true,
  })),
  { type: 'bajo', name: 'BAJO', blurb: 'Bass engine. Per-step wobble, four-band gate, and a plucked upright at the other end.', color: '#FF4B1C', ready: true },
];

/** What an instrument is called, wherever it needs a name. */
export function instrumentLabel(type: InstrumentType): string {
  if (type === 'kera') return 'KERA';
  if (type === 'bajo') return 'BAJO';
  if (isSuite(type)) return SUITE[type].name;
  return 'ONDA';
}

/** ...and its colour. Both were inlined in three places, which is why a BAJO or a CANTUS
 *  dropped on a pad came out labelled "ONDA" in ONDA's purple. */
export function instrumentColor(type: InstrumentType): string {
  if (type === 'kera') return '#00DAF3';
  if (type === 'bajo') return '#FF4B1C';
  if (isSuite(type)) return SUITE[type].accent;
  return '#B84DFF';
}

/**
 * Build an instrument track. Defaults to a fresh Init patch — the user asked to choose the
 * INSTRUMENT first, so a preset is an optional later step inside the panel, not a gate on
 * creation. Armed immediately because you want to play what you just added.
 */
export function makeInstrumentTrack(type: InstrumentType, count: number, presetPatch?: ReturnType<typeof serializePatch>, presetName?: string): ArrangeTrack {
  const label = presetName || `${instrumentLabel(type)} ${count + 1}`;
  return {
    id: grooveUid(),
    kind: 'instrument',
    name: label,
    color: instrumentColor(type),
    mute: false, solo: false, gainDb: 0, pan: 0,
    clips: [],
    instrument: {
      type,
      // KERA ignores the patch (it plays a loaded program), but a valid ONDA patch keeps the
      // shared filter/envelope defaults sane and the serialize path uniform. VELA has its own
      // patch shape — the two instruments share the engine and the id space but not a single
      // patch field beyond the envelope.
      patch: presetPatch || (isSuite(type)
        ? (serializeVelaPatch(newVelaPatch(presetsFor(type)[0])) as ReturnType<typeof serializePatch>)
        : type === 'bajo'
          ? (serializeBajoPatch(newBajoPatch()) as ReturnType<typeof serializePatch>)
          : serializePatch(newPatch(label))),
      presetName,
    },
    armed: true,
    position: [0, 0, -1],
  };
}

/**
 * Make a pad's instrument a real instrument track, flagged `padOwned` so the arranger hides it and
 * the pad sequencer — not clips — drives it. The pad then plays this instrument at its base note;
 * every instrument surface (editor panels, arp, offline render, patch persistence) is reused as-is.
 * Returns the new track id; the caller links it onto the pad.
 */
export function addPadInstrument(
  doc: { arrangement: ArrangeTrack[] },
  padIdx: number,
  type: InstrumentType,
  presetPatch?: ReturnType<typeof serializePatch>,
  presetName?: string,
): string {
  const count = doc.arrangement.filter((t) => t.kind === 'instrument').length;
  const track = makeInstrumentTrack(type, count, presetPatch, presetName);
  track.armed = false;          // pads are triggered, never the armed keyboard target
  track.padOwned = true;
  track.padIndex = padIdx;
  track.name = presetName || `Pad ${padIdx + 1} · ${instrumentLabel(type)}`;
  doc.arrangement.push(track);
  return track.id;
}

/**
 * Maschine "Groups" fill rule: put a new instrument on the FIRST empty pad, creating a new bank of
 * 16 when the current banks are full — so instruments fill pads consecutively and a full Group
 * spawns the next. Returns the pad it landed on + the padOwned track id.
 */
export function addInstrumentToNextPad(
  doc: GrooveDoc,
  type: InstrumentType,
  presetPatch?: ReturnType<typeof serializePatch>,
  presetName?: string,
): { padIdx: number; trackId: string } {
  let padIdx = firstEmptyPadIndex(doc.kit);
  if (padIdx < 0) padIdx = addPadBank(doc.kit); // every pad full → open a new Group, take its first pad
  const trackId = addPadInstrument(doc, padIdx, type, presetPatch, presetName);
  const pad = doc.kit[padIdx];
  if (pad) {
    pad.source = 'instrument';
    pad.instrumentTrackId = trackId;
    pad.empty = false;
    pad.name = presetName || instrumentLabel(type);
    pad.color = instrumentColor(type);
    if (pad.instrumentNote === undefined) pad.instrumentNote = 60;
  }
  return { padIdx, trackId };
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
