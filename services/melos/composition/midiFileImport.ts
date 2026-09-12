// midiFileImport — parse a Standard MIDI File (.mid, SMF format 0/1) into Melos NoteEvents / a MIDI
// clip. Self-contained (no dependency) — SMF is a small, well-defined binary format. Composer P1:
// "take a user-recorded MIDI file and interpret what they're trying to do" starts with reading it in.
import { grooveUid, type NoteEvent, type TimelineClip } from '../beats/grooveDoc';

export interface MidiImportResult {
  notes: NoteEvent[];   // merged across tracks, startBeats relative to 0, sorted
  bpm: number;          // first tempo found (default 120)
  ticksPerBeat: number;
}

/** Variable-length quantity reader — returns [value, nextOffset]. */
function readVLQ(v: DataView, off: number): [number, number] {
  let value = 0, o = off;
  for (let i = 0; i < 4; i++) {
    const b = v.getUint8(o++);
    value = (value << 7) | (b & 0x7f);
    if (!(b & 0x80)) break;
  }
  return [value, o];
}

const str4 = (v: DataView, off: number) => String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));

/** Parse an SMF buffer → NoteEvents in beats. Throws on a non-MIDI buffer. */
export function parseMidiFile(buffer: ArrayBuffer): MidiImportResult {
  const v = new DataView(buffer);
  if (str4(v, 0) !== 'MThd') throw new Error('Not a MIDI file (missing MThd header)');
  const headerLen = v.getUint32(4);
  const division = v.getUint16(12);
  const ticksPerBeat = (division & 0x8000) ? 480 : division || 480; // SMPTE division → fall back to 480
  let bpm = 120;
  const notes: NoteEvent[] = [];
  let off = 8 + headerLen;

  while (off + 8 <= buffer.byteLength) {
    if (str4(v, off) !== 'MTrk') break;
    const len = v.getUint32(off + 4);
    let o = off + 8;
    const end = o + len;
    let tick = 0;
    let status = 0;
    const open = new Map<number, { tick: number; vel: number }>(); // (channel<<8|key) → note-on

    while (o < end) {
      const [delta, o2] = readVLQ(v, o); o = o2; tick += delta;
      let b = v.getUint8(o);
      if (b & 0x80) { status = b; o++; } // new status, else running status (reuse `status`)
      const type = status & 0xf0;
      const chan = status & 0x0f;

      if (status === 0xff) {              // meta event
        const metaType = v.getUint8(o++); const [mlen, o3] = readVLQ(v, o); o = o3;
        if (metaType === 0x51 && mlen === 3) { const us = (v.getUint8(o) << 16) | (v.getUint8(o + 1) << 8) | v.getUint8(o + 2); if (us > 0) bpm = Math.round(60000000 / us); }
        o += mlen;
      } else if (status === 0xf0 || status === 0xf7) { // sysex
        const [slen, o3] = readVLQ(v, o); o = o3 + slen;
      } else if (type === 0x90 || type === 0x80) {     // note-on / note-off
        const key = v.getUint8(o++); const vel = v.getUint8(o++);
        const id = (chan << 8) | key;
        if (type === 0x90 && vel > 0) { open.set(id, { tick, vel }); }
        else { // note-off (or note-on vel 0)
          const on = open.get(id);
          if (on) {
            open.delete(id);
            notes.push({
              id: grooveUid(),
              startBeats: on.tick / ticksPerBeat,
              lengthBeats: Math.max(0.0625, (tick - on.tick) / ticksPerBeat),
              key, vel: Math.max(1, Math.min(127, on.vel)),
            });
          }
        }
      } else if (type === 0xc0 || type === 0xd0) {     // program change / channel pressure — 1 data byte
        o += 1;
      } else {                                          // 0xA0/0xB0/0xE0 — 2 data bytes
        o += 2;
      }
    }
    off = end;
  }

  notes.sort((a, b) => a.startBeats - b.startBeats);
  // Normalise so the earliest note starts at beat 0.
  const first = notes.length ? notes[0].startBeats : 0;
  if (first > 0) for (const n of notes) n.startBeats -= first;
  return { notes, bpm, ticksPerBeat };
}

/** Parse an SMF buffer straight into a TimelineClip (bar-length rounded up). Null if it has no notes. */
export function midiFileToClip(buffer: ArrayBuffer, startBeats = 0, barBeats = 4): TimelineClip | null {
  const { notes } = parseMidiFile(buffer);
  if (!notes.length) return null;
  const end = notes.reduce((m, n) => Math.max(m, n.startBeats + n.lengthBeats), 0);
  const lengthBeats = Math.max(barBeats, Math.ceil(end / barBeats) * barBeats);
  return { id: grooveUid(), startBeats, lengthBeats, notes };
}
