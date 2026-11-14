// Drop a hand-drum performance into MEKA: onto a SOMA pad (the selected one, else the first SOMA pad
// in that Group, else SOMA on the next free pad), as a new pattern in that pad's own Group, written in
// the pad's piano roll as hand-map strokes with their velocities and micro-timing — so it shows where
// you're looking and plays like a person. The SOMA patch is switched to a hand drum (and the hand map
// turned on) only when it isn't one already.

import type { GrooveDoc, MeloNote, Pattern } from '../grooveDoc';
import { grooveUid } from '../grooveDoc';
import { SOMA_PRESETS } from '../../instruments/soma/presets';
import { applySomaPreset, deserializeSomaPatch, newSomaPatch, serializeSomaPatch, somaHandConfig } from '../../instruments/soma/patch';
import { strokeKey } from '../../instruments/soma/handMap';
import { performHandDrum, type PerformOptions } from './handDrumPerformer';

const PADS_PER_GROUP = 16;

function somaTrackFor(doc: GrooveDoc, padIdx: number) {
  const pad = doc.kit[padIdx];
  if (!pad || pad.source !== 'instrument' || !pad.instrumentTrackId) return undefined;
  const track = doc.arrangement.find((t) => t.id === pad.instrumentTrackId && t.kind === 'instrument');
  return track?.instrument?.type === 'soma' ? track : undefined;
}

/** The SOMA pad to write to: the selected pad if it's SOMA, else the first SOMA pad in its Group. */
export function findSomaPad(doc: GrooveDoc, selectedPad: number): number {
  if (somaTrackFor(doc, selectedPad)) return selectedPad;
  const g = Math.floor(selectedPad / PADS_PER_GROUP) * PADS_PER_GROUP;
  for (let i = g; i < Math.min(doc.kit.length, g + PADS_PER_GROUP); i++) if (somaTrackFor(doc, i)) return i;
  return doc.kit.findIndex((_, i) => !!somaTrackFor(doc, i));
}

export interface HandPatternResult { patternId: string; padIdx: number; group: number; presetChanged: string | null }

/** `addSoma` puts SOMA on the next free pad and returns it (instrumentFactory.addInstrumentToNextPad in the app). */
export function applyHandPattern(doc: GrooveDoc, selectedPad: number, opts: PerformOptions & { name: string; setTempo: boolean }, addSoma: (doc: GrooveDoc) => number): HandPatternResult {
  let padIdx = findSomaPad(doc, selectedPad);
  if (padIdx < 0) padIdx = addSoma(doc);
  const track = somaTrackFor(doc, padIdx)!;
  const pad = doc.kit[padIdx];

  // A hand pattern needs a hand drum with the hand map on.
  let patch = deserializeSomaPatch(track.instrument!.patch as Record<string, unknown> | undefined) ?? newSomaPatch();
  let presetChanged: string | null = null;
  if (!somaHandConfig(patch).enabled) {
    const preset = SOMA_PRESETS.find((p) => p.id === opts.rhythm.preset);
    if (preset) { patch = applySomaPreset(patch, preset); presetChanged = preset.name; }
  }
  patch = { ...patch, hand: { enabled: true, layout: 'keys' } };
  track.instrument!.patch = serializeSomaPatch(patch);
  if (presetChanged) { track.instrument!.presetName = presetChanged; pad.name = presetChanged; }

  // Notes are written relative to the pad's own pitch; the home drum's C is the bass stroke.
  const homeC = Math.floor((patch.defaultNote || 48) / 12) * 12;
  pad.instrumentNote = homeC;
  const base = homeC + (pad.pitchSemis || 0);

  const perf = performHandDrum(opts);
  const lane: Record<number, MeloNote[]> = {};
  for (const s of perf.strokes) {
    const note = homeC + strokeKey(s.stroke, s.hand) + 12 * s.drum;
    const semi = Math.max(-24, Math.min(24, note - base));
    const n: MeloNote = { semi, v: s.vel, len: 1 };
    if (s.micro) n.micro = s.micro;
    (lane[s.step] || (lane[s.step] = [])).push(n);
  }
  const group = Math.floor(padIdx / PADS_PER_GROUP);
  const pat: Pattern = { id: grooveUid() + grooveUid(), name: opts.name, length: perf.length, steps: {}, melo: { [padIdx]: lane } };
  if (group > 0) pat.groupIdx = group;
  doc.patterns.push(pat);
  if (opts.setTempo) doc.bpm = opts.rhythm.bpm;
  return { patternId: pat.id, padIdx, group, presetChanged };
}
