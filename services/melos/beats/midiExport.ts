// Melos Beats — Standard MIDI File export (SMF type 1, 480 PPQ). The symmetric half of
// composition/midiFileImport.ts, reading the doc the way playback does:
//   • conductor track: tempo map (ramps stepped every 16th), time signatures, key signature
//   • one track per instrument track: what its clips PLAY (slip + loop via clipContent), with the
//     effective CC lanes (CC1 mod, CC11 expression, CC64 sustain, pitch bend, CC7 volume, CC10 pan)
//   • MEKA pattern clips as a GM drum track on channel 10
// Exports a whole project, one track, or one clip.

import type { ArrangeTrack, GrooveDoc, TimelineClip, TrackAutomationLane } from './grooveDoc';
import { songTime } from './tempoMap';
import { noteOccurrences } from './clipContent';
import { effectiveLanes, laneValueAt, targetKey } from './automation';
import { docKey } from './songKey';

export const PPQ = 480;
const STEP = 0.25;

interface Ev { tick: number; order: number; bytes: number[] }

const vlq = (n: number): number[] => {
  let v = Math.max(0, Math.round(n));
  const out = [v & 0x7f];
  while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
  return out;
};
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const text = (s: string) => Array.from(new TextEncoder().encode(s));
const tickOf = (beat: number) => Math.max(0, Math.round(beat * PPQ));
const clamp7 = (v: number) => Math.max(0, Math.min(127, Math.round(v)));

function chunk(events: Ev[], name?: string): number[] {
  const evs = events.slice().sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  if (name) body.push(0, 0xff, 0x03, ...vlq(text(name).length), ...text(name));
  let last = 0;
  for (const e of evs) { body.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  body.push(...vlq(0), 0xff, 0x2f, 0x00);
  return [...text('MTrk'), ...u32(body.length), ...body];
}

/** Tempo map, meters and key on the conductor track. */
function conductor(doc: GrooveDoc, endBeat: number, offsetBeat = 0): Ev[] {
  const { tempo, meter } = songTime(doc);
  const evs: Ev[] = [];
  const tempoEv = (beat: number, bpm: number) => {
    const us = Math.round(60_000_000 / bpm);
    evs.push({ tick: tickOf(beat - offsetBeat), order: 0, bytes: [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff] });
  };
  if (tempo.isConstant) tempoEv(offsetBeat, doc.bpm);
  else {
    let last = -1;
    for (let b = offsetBeat; b < endBeat; b += STEP) {
      const bpm = Math.round(tempo.bpmAt(b) * 100) / 100;
      if (bpm !== last) { tempoEv(b, bpm); last = bpm; }
    }
  }
  const bars = meter.bars(offsetBeat, Math.max(endBeat, offsetBeat + 1e-3));
  let lastSig = '';
  const first = meter.at(offsetBeat);
  for (const b of [first, ...bars]) {
    const sig = `${b.num}/${b.den}`;
    if (sig === lastSig) continue;
    lastSig = sig;
    evs.push({ tick: tickOf(Math.max(offsetBeat, b.startBeat) - offsetBeat), order: 1, bytes: [0xff, 0x58, 0x04, b.num, Math.round(Math.log2(b.den)), 24, 8] });
  }
  const key = docKey(doc);
  if (key) {
    // Key signature: sharps/flats of the tonic's major (or relative-major for minor-ish modes).
    const minor = /minor|dorian|phrygian|locrian|blues|pent/.test(key.scale) && key.scale !== 'major-pent';
    const majorPc = minor ? (key.tonic + 3) % 12 : key.tonic;
    const SF: Record<number, number> = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 };
    evs.push({ tick: 0, order: 2, bytes: [0xff, 0x59, 0x02, (SF[majorPc] ?? 0) & 0xff, minor ? 1 : 0] });
  }
  return evs;
}

const CC_OF: Record<string, number> = { 'mod-wheel': 1, expression: 11, sustain: 64, volume: 7, pan: 10 };

/** CC / pitch-bend events for a track's effective lanes over [from, to) song beats. */
function laneEvents(lanes: Map<string, TrackAutomationLane>, ch: number, from: number, to: number, offset: number): Ev[] {
  const evs: Ev[] = [];
  for (const lane of lanes.values()) {
    const key = targetKey(lane.target);
    const isPb = lane.target.kind === 'pitch-bend';
    const cc = CC_OF[key];
    if (!isPb && cc === undefined) continue;
    let last = -1;
    for (let b = from; b < to; b += 1 / 16) {
      const v = laneValueAt(lane, b);
      if (v === undefined) break;
      let data: number[];
      let sig: number;
      if (isPb) {
        const raw = Math.max(0, Math.min(16383, Math.round((v + 1) * 8191.5)));
        data = [0xe0 | ch, raw & 0x7f, (raw >> 7) & 0x7f];
        sig = raw;
      } else {
        // CC7 uses the GM volume curve: dB = 40·log10(cc/127).
        const val = lane.target.kind === 'volume' ? (v <= -69.9 ? 0 : clamp7(127 * Math.pow(10, v / 40)))
          : lane.target.kind === 'pan' ? clamp7((v + 1) * 63.5) : clamp7(v * 127);
        data = [0xb0 | ch, cc, val];
        sig = val;
      }
      if (sig === last) continue;
      last = sig;
      evs.push({ tick: tickOf(b - offset), order: 3, bytes: data });
    }
  }
  return evs;
}

/** Note on/off pairs for one instrument track over [from, to). */
function instrumentEvents(track: ArrangeTrack, ch: number, from: number, to: number, offset: number, onlyClip?: TimelineClip): Ev[] {
  const evs: Ev[] = [];
  for (const clip of onlyClip ? [onlyClip] : track.clips) {
    for (const o of noteOccurrences(clip, from, to)) {
      const on = tickOf(o.songBeat - offset);
      const off = Math.max(on + 1, tickOf(o.songBeat + o.lengthBeats - offset));
      evs.push({ tick: on, order: 5, bytes: [0x90 | ch, clamp7(o.note.key), Math.max(1, clamp7(o.note.vel))] });
      evs.push({ tick: off, order: 4, bytes: [0x80 | ch, clamp7(o.note.key), 0] });
    }
  }
  return evs;
}

/** GM drum note for a MEKA pad. */
function gmDrum(doc: GrooveDoc, padIdx: number): number {
  const pad = doc.kit[padIdx];
  const byVoice: Record<string, number> = { kick: 36, snare: 38, clap: 39, 'hat-closed': 42, 'hat-open': 46, sub: 35 };
  if (pad?.synthVoice && pad.source === 'synth') return byVoice[pad.synthVoice] ?? 36 + (padIdx % 48);
  const n = (pad?.name || '').toLowerCase();
  if (/kick|bd/.test(n)) return 36;
  if (/snare|sd/.test(n)) return 38;
  if (/clap/.test(n)) return 39;
  if (/open/.test(n)) return 46;
  if (/hat|hh/.test(n)) return 42;
  if (/rim/.test(n)) return 37;
  if (/tom/.test(n)) return 45;
  if (/crash/.test(n)) return 49;
  if (/ride/.test(n)) return 51;
  return 36 + (padIdx % 48);
}

/** MEKA pattern clips → drum hits (the same step walk as the scheduler; swing + micro applied). */
function drumEvents(doc: GrooveDoc, from: number, to: number, offset: number): Ev[] {
  const evs: Ev[] = [];
  const anySolo = doc.arrangement.some((t) => t.solo);
  for (const track of doc.arrangement) {
    if (track.kind !== 'pattern' || track.foreign || track.mute || (anySolo && !track.solo)) continue;
    for (const clip of track.clips) {
      const pattern = clip.patternId ? doc.patterns.find((p) => p.id === clip.patternId) : undefined;
      if (!pattern) continue;
      const steps = Math.round(clip.lengthBeats / STEP);
      for (let s = 0; s < steps; s++) {
        const beat = clip.startBeats + s * STEP;
        if (beat < from - 1e-9 || beat >= to) continue;
        const into = Math.round((s * STEP + (clip.contentOffsetBeats ?? 0)) / STEP);
        for (const padKey of Object.keys(pattern.steps)) {
          const padIdx = Number(padKey);
          const pad = doc.kit[padIdx];
          if (!pad || pad.empty || pad.mute) continue;
          const len = Math.max(1, Math.min(pattern.length, Math.round(clip.padLens?.[padIdx] ?? pattern.length)));
          const local = ((into % len) + len) % len;
          const step = pattern.steps[padIdx]?.[local];
          if (!step) continue;
          let b = beat + (step.micro ?? 0) * STEP;
          if (local % 2 === 1 && doc.swing > 0) b += doc.swing * 0.5 * STEP;
          const on = tickOf(b - offset);
          const note = gmDrum(doc, padIdx);
          evs.push({ tick: on, order: 5, bytes: [0x99, note, Math.max(1, clamp7(step.v))] });
          evs.push({ tick: on + Math.round(PPQ * STEP * 0.9), order: 4, bytes: [0x89, note, 0] });
        }
      }
    }
  }
  return evs;
}

function file(chunks: number[][]): Uint8Array {
  const header = [...text('MThd'), ...u32(6), 0, 1, (chunks.length >> 8) & 0xff, chunks.length & 0xff, (PPQ >> 8) & 0xff, PPQ & 0xff];
  return new Uint8Array([...header, ...chunks.flat()]);
}

const songEnd = (doc: GrooveDoc) => Math.max(4, ...doc.arrangement.flatMap((t) => t.clips.map((c) => c.startBeats + c.lengthBeats)));
/** MIDI channels for instrument tracks, skipping 10 (drums). */
const channelFor = (i: number) => { const c = i % 15; return c >= 9 ? c + 1 : c; };

/** Whole project: conductor + every instrument track + MEKA drums. */
export function exportProjectMidi(doc: GrooveDoc): Uint8Array {
  const end = songEnd(doc);
  const chunks: number[][] = [chunk(conductor(doc, end), doc.name || 'Melos')];
  const insts = doc.arrangement.filter((t) => t.kind === 'instrument' && !t.foreign && !t.padOwned && t.clips.some((c) => c.notes?.length));
  insts.forEach((t, i) => {
    const ch = channelFor(i);
    chunks.push(chunk([...instrumentEvents(t, ch, 0, end, 0), ...laneEvents(effectiveLanes(t), ch, 0, end, 0)], t.name));
  });
  const drums = drumEvents(doc, 0, end, 0);
  if (drums.length) chunks.push(chunk(drums, 'MEKA drums'));
  return file(chunks);
}

/** One instrument track, from song start (keeps its place in the song). */
export function exportTrackMidi(doc: GrooveDoc, trackId: string): Uint8Array | null {
  const t = doc.arrangement.find((x) => x.id === trackId);
  if (!t) return null;
  const end = songEnd(doc);
  if (t.kind === 'pattern') return file([chunk(conductor(doc, end), doc.name || 'Melos'), chunk(drumEvents({ ...doc, arrangement: [t] }, 0, end, 0), t.name)]);
  if (t.kind !== 'instrument') return null;
  return file([chunk(conductor(doc, end), doc.name || 'Melos'), chunk([...instrumentEvents(t, 0, 0, end, 0), ...laneEvents(effectiveLanes(t), 0, 0, end, 0)], t.name)]);
}

/** One MIDI clip, starting at tick 0 (tempo/meter as they are at the clip). */
export function exportClipMidi(doc: GrooveDoc, trackId: string, clipId: string): Uint8Array | null {
  const t = doc.arrangement.find((x) => x.id === trackId);
  const c = t?.clips.find((x) => x.id === clipId);
  if (!t || !c || !c.notes?.length) return null;
  const from = c.startBeats, to = c.startBeats + c.lengthBeats;
  const lanes = effectiveLanes({ ...t, automationLanes: [], clips: [c] });
  return file([
    chunk(conductor(doc, to, from), doc.name || 'Melos'),
    chunk([...instrumentEvents(t, 0, from, to, from, c), ...laneEvents(lanes, 0, from, to, from)], c.name || t.name),
  ]);
}

/** Save bytes as a .mid download. */
export function downloadMidi(bytes: Uint8Array, name: string): void {
  const safe = (name || 'melos').replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'melos';
  const blob = new Blob([bytes], { type: 'audio/midi' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}.mid`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
