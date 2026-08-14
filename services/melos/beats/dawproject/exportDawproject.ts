// .dawproject v1.0 export (Bitwig/PreSonus open interchange, github.com/bitwig/dawproject).
// Content strategy for a sample-based groove box, honest for the receiving DAW:
//   • per-pad NOTE tracks (editable in Bitwig) — drum hits on MIDI channel 0 at key 36+padIdx,
//     pitch-roll notes on channel 1 at their real pitches (48+semi), literal timing (swing and
//     micro folded into Note time, not the grid),
//   • one printed AUDIO track with the full-song bounce so the project sounds immediately,
//   • the pad samples embedded under samples/ for manual reassignment,
//   • any preserved foreign XML (imported Bitwig/S1 elements we don't model) re-emitted
//     verbatim — opening a foreign project in Beats and re-exporting destroys nothing.

import { zipSync, strToU8 } from 'fflate';
import type { GrooveDoc, Pattern } from '../grooveDoc';
import { el, xmlDoc, xmlEscape } from './xml';
import { encodeWavBytes } from '../../../audio/wavEncode';

export const APP_NAME = 'Plajah Melos Beats';
export const DRUM_KEY_BASE = 36;   // channel 0: key = 36 + padIdx
export const MELO_KEY_BASE = 48;   // channel 1: key = 48 + semi (PitchRoll's C3 base)

export interface ForeignXml { tracks?: string[]; lanes?: string[] }

const num = (v: number) => String(Math.round(v * 1e6) / 1e6);

/** All Notes for ONE pad across a clip window — drum hits (ch 0) + pitch-roll notes (ch 1). */
function padNotesForWindow(doc: GrooveDoc, pattern: Pattern, padIdx: number, clipLengthBeats: number): string[] {
  const out: string[] = [];
  const stepBeats = 0.25;
  const totalSteps = Math.round(clipLengthBeats / stepBeats);
  for (let s = 0; s < totalSteps; s++) {
    const local = s % pattern.length;
    const base = s * stepBeats;
    const swing = local % 2 === 1 ? doc.swing * 0.5 * stepBeats : 0;
    const st = pattern.steps[padIdx]?.[local];
    if (st) {
      const sustaining = (doc.kit[padIdx]?.env.sustain || 0) > 0.001;
      // Legato gate mirrors the scheduler: hold to the next active step on the pad.
      let durBeats = stepBeats;
      if (sustaining) {
        let dist: number = pattern.length;
        for (let i = 1; i <= pattern.length; i++) if (pattern.steps[padIdx]?.[(local + i) % pattern.length]) { dist = i; break; }
        durBeats = dist * stepBeats;
      }
      out.push(el('Note', {
        time: num(base + swing + (st.micro || 0) * stepBeats),
        duration: num(durBeats),
        channel: 0,
        key: DRUM_KEY_BASE + padIdx,
        vel: num(st.v / 127),
        rel: num(st.v / 127),
      }));
    }
    const meloNotes = pattern.melo?.[padIdx]?.[local];
    if (meloNotes?.length) {
      for (const n of meloNotes) {
        out.push(el('Note', {
          time: num(base + swing),
          duration: num(Math.max(1, n.len) * stepBeats),
          channel: 1,
          key: MELO_KEY_BASE + n.semi,
          vel: num(n.v / 127),
          rel: num(n.v / 127),
        }));
      }
    }
  }
  return out;
}

export interface ExportInputs {
  doc: GrooveDoc;
  /** Pad sample buffers for embedding (engine.getSampleEntries()). */
  buffers: [string, AudioBuffer][];
  /** The full-song bounce (render.ts) — becomes the printed audio track. */
  printBlobBytes?: Uint8Array;
  printSeconds?: number;
  artist?: string;
}

export async function exportDawproject(inp: ExportInputs): Promise<Blob> {
  const { doc } = inp;
  const foreign: ForeignXml = (() => { try { return doc.foreignXml ? JSON.parse(doc.foreignXml) : {}; } catch { return {}; } })();
  const bufMap = new Map(inp.buffers);

  // Which pads carry notes anywhere? Only those get tracks — 16 empty lanes is noise.
  const usedPads = new Set<number>();
  for (const pat of doc.patterns) {
    for (const k of Object.keys(pat.steps)) if (Object.keys(pat.steps[Number(k)] || {}).length) usedPads.add(Number(k));
    for (const k of Object.keys(pat.melo || {})) usedPads.add(Number(k));
  }
  const padList = [...usedPads].sort((a, b) => a - b);

  // ---- Structure ----
  const groupTracks = ['A', 'B', 'C', 'D'].map((g, i) =>
    el('Track', { contentType: 'audio notes', loaded: 'true', id: `t-group${g}`, name: `Bus ${g}` },
      el('Channel', { audioChannels: 2, role: 'regular', id: `c-group${g}` },
        el('Volume', { unit: 'linear', value: num(Math.pow(10, doc.mixer.groups[i].gainDb / 20)), id: `v-group${g}` }),
        el('Mute', { value: String(doc.mixer.groups[i].mute), id: `m-group${g}` }),
        el('Destination', { ref: 'c-master' }),
      )));

  const padTracks = padList.map((padIdx) => {
    const pad = doc.kit[padIdx];
    const g = 'ABCD'[pad.group];
    return el('Track', { contentType: 'notes', loaded: 'true', id: `t-pad${padIdx}`, name: pad.name, color: pad.color },
      el('Channel', { audioChannels: 2, role: 'regular', id: `c-pad${padIdx}` },
        el('Volume', { unit: 'linear', value: num(Math.pow(10, pad.gainDb / 20)), id: `v-pad${padIdx}` }),
        el('Pan', { unit: 'normalized', value: num((pad.pan + 1) / 2), id: `p-pad${padIdx}` }),
        el('Mute', { value: String(!!pad.mute), id: `m-pad${padIdx}` }),
        el('Destination', { ref: `c-group${g}` }),
      ));
  });

  const audioTracks = doc.arrangement.filter((t) => t.kind === 'audio' && !t.foreign).map((t) =>
    el('Track', { contentType: 'audio', loaded: 'true', id: `t-${t.id}`, name: t.name, color: t.color },
      el('Channel', { audioChannels: 2, role: 'regular', id: `c-${t.id}` },
        el('Volume', { unit: 'linear', value: num(Math.pow(10, t.gainDb / 20)), id: `v-${t.id}` }),
        el('Pan', { unit: 'normalized', value: num((t.pan + 1) / 2), id: `p-${t.id}` }),
        el('Mute', { value: String(t.mute), id: `m-${t.id}` }),
        el('Destination', { ref: 'c-master' }),
      )));

  const printTrack = inp.printBlobBytes
    ? el('Track', { contentType: 'audio', loaded: 'true', id: 't-print', name: 'Groove Print' },
        el('Channel', { audioChannels: 2, role: 'regular', id: 'c-print' }, el('Destination', { ref: 'c-master' })))
    : '';

  const masterTrack = el('Track', { contentType: 'audio notes', id: 't-master', name: 'Master' },
    el('Channel', { audioChannels: 2, role: 'master', id: 'c-master' },
      el('Volume', { unit: 'linear', value: num(Math.pow(10, doc.mixer.master.gainDb / 20)), id: 'v-master' })));

  // ---- Arrangement lanes ----
  const zipFiles: Record<string, Uint8Array | [Uint8Array, { level: number }]> = {};

  const padLanes = padList.map((padIdx) => {
    const clips: string[] = [];
    for (const track of doc.arrangement) {
      if (track.kind !== 'pattern' || track.foreign || track.mute) continue;
      for (const clip of track.clips) {
        if (!clip.patternId) continue;
        const pattern = doc.patterns.find((x) => x.id === clip.patternId);
        if (!pattern) continue;
        const notes = padNotesForWindow(doc, pattern, padIdx, clip.lengthBeats);
        if (!notes.length) continue;
        clips.push(el('Clip', { time: num(clip.startBeats), duration: num(clip.lengthBeats), playStart: '0', name: pattern.name },
          el('Notes', { id: `n-${clip.id}-p${padIdx}` }, ...notes)));
      }
    }
    if (!clips.length) return '';
    return el('Lanes', { track: `t-pad${padIdx}`, id: `l-pad${padIdx}` }, el('Clips', { id: `cl-pad${padIdx}` }, ...clips));
  }).filter(Boolean);

  const audioLanes = doc.arrangement.filter((t) => t.kind === 'audio' && !t.foreign).map((t) => {
    const clips = t.clips.filter((c) => c.audio).map((c) => {
      const buf = bufMap.get(c.audio!.sampleKey);
      const fname = `audio/${c.audio!.sampleKey.split('/').pop()}.wav`;
      if (buf && !zipFiles[fname]) zipFiles[fname] = [new Uint8Array(encodeWavBytes(buf, 24)), { level: 0 }];
      return el('Clip', { time: num(c.startBeats), duration: num(c.lengthBeats), playStart: '0', name: c.audio!.name },
        buf ? el('Audio', { channels: 2, duration: num(c.audio!.durationSec), sampleRate: buf.sampleRate, algorithm: 'raw' },
          el('File', { path: fname })) : '');
    });
    if (!clips.length) return '';
    return el('Lanes', { track: `t-${t.id}`, id: `l-${t.id}` }, el('Clips', { id: `cl-${t.id}` }, ...clips));
  }).filter(Boolean);

  const songBeats = Math.max(4, ...doc.arrangement.flatMap((t) => t.clips.map((c) => c.startBeats + c.lengthBeats)));
  const printLane = inp.printBlobBytes
    ? el('Lanes', { track: 't-print', id: 'l-print' },
        el('Clips', { id: 'cl-print' },
          el('Clip', { time: '0', duration: num(songBeats), playStart: '0' },
            el('Audio', { channels: 2, duration: num(inp.printSeconds || 0), sampleRate: 48000, algorithm: 'raw' },
              el('File', { path: 'audio/groove-print.wav' })))))
    : '';

  const projectXml = xmlDoc(el('Project', { version: '1.0' },
    el('Application', { name: APP_NAME, version: '0.1.0' }),
    el('Transport', {},
      el('Tempo', { unit: 'bpm', value: num(doc.bpm), id: 'tempo' }),
      el('TimeSignature', { numerator: 4, denominator: 4, id: 'tsig' })),
    el('Structure', {},
      ...padTracks, ...groupTracks, ...audioTracks, printTrack,
      ...(foreign.tracks || []), // preserved foreign tracks, verbatim
      masterTrack),
    el('Arrangement', { id: 'arr' },
      el('Lanes', { timeUnit: 'beats', id: 'lanes' },
        ...padLanes, ...audioLanes, printLane,
        ...(foreign.lanes || []))),
    el('Scenes', {}),
  ));

  const metadataXml = xmlDoc(el('MetaData', {},
    el('Title', {}, xmlEscape(doc.name || 'Groove')),
    el('Artist', {}, xmlEscape(inp.artist || ''))));

  // Embed pad samples for manual reassignment in the receiving DAW.
  for (const padIdx of padList) {
    const pad = doc.kit[padIdx];
    if (pad.source !== 'sample' || !pad.sample) continue;
    const buf = bufMap.get(pad.sample.key);
    if (!buf) continue;
    const fname = `samples/${pad.sample.key.split('/').pop()}_${pad.name.replace(/[^\w-]+/g, '_')}.wav`;
    if (!zipFiles[fname]) zipFiles[fname] = [new Uint8Array(encodeWavBytes(buf, 24)), { level: 0 }];
  }

  zipFiles['project.xml'] = strToU8(projectXml);
  zipFiles['metadata.xml'] = strToU8(metadataXml);
  if (inp.printBlobBytes) zipFiles['audio/groove-print.wav'] = [inp.printBlobBytes, { level: 0 }];

  const zipped = zipSync(zipFiles as Parameters<typeof zipSync>[0]);
  return new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });
}
