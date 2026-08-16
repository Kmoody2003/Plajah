// KERA program persistence — the piece that makes a sampler patch a real, reloadable part of a
// saved project.
//
// A KeraProgram is two very different things: musical METADATA (zones, loops, tuning, amp) that is
// small plain JSON, and decoded PCM (Float32 per channel) that is large binary. They persist to
// different places, both scoped to the OWNER and no one else:
//   • metadata  → serialized here into the groove doc's TrackInstrument, which autosaves to the
//                 user's own Firestore production. Small enough to live in the document.
//   • PCM       → content-addressed in OPFS (instant local reopen) with a durable copy in the
//                 owner's PRIVATE locker at personal/{uid}/… — the same per-user path pad samples
//                 already use. Never a shared or public path.
//
// PCM is stored in an exact little-endian float format, NOT via encodeWav + decodeAudioData:
// decodeAudioData resamples to the AudioContext's rate, which would silently move loop points
// (kept in frames) and shift playback pitch. Round-tripping our own bytes preserves the sample
// exactly — original rate, original frame count, sample-accurate loops.

import { putBytes, getBytes, hasBytes } from '../../../fabula/mediaStore';
import { uploadFile } from '../../../backendService';
import { auth } from '../../../firebase';
import { emptyProgram, type KeraProgram, type KeraSample } from './zones';

const MAGIC = 0x4b524131; // 'KRA1'
const HEADER_BYTES = 20;   // magic(4) + sampleRate f64(8) + channels u32(4) + frames u32(4)
const keyFor = (hash: string) => `melos/beats/kera/${hash}`;

/** A stored KERA sample: musical metadata inline, PCM referenced by content hash. */
export interface SerializedKeraSample {
  id: string;
  name: string;
  sampleRate: number;
  frames: number;
  channelCount: number;
  rootNote: number;
  fineTune: number;
  loopStart: number;
  loopEnd: number;
  loopMode: 'off' | 'forward' | 'sustain';
  /** Content-addressed OPFS key + durable per-user locker URL for the PCM blob. */
  key: string;
  lockerUrl?: string;
}

/** The whole program minus PCM — safe to embed in the groove doc and write to Firestore. */
export interface SerializedKeraProgram {
  v: 1;
  name: string;
  source: KeraProgram['source'];
  zones: KeraProgram['zones'];
  amp: KeraProgram['amp'];
  playMode: KeraProgram['playMode'];
  transpose: number;
  gainDb: number;
  polyphony: number;
  samples: SerializedKeraSample[];
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Pack a sample's channels into one exact little-endian blob (channel-major float32). */
function packPcm(sample: KeraSample): ArrayBuffer {
  const channelCount = sample.channels.length;
  const frames = sample.channels[0]?.length ?? 0;
  const ab = new ArrayBuffer(HEADER_BYTES + channelCount * frames * 4);
  const view = new DataView(ab);
  view.setUint32(0, MAGIC, true);
  view.setFloat64(4, sample.sampleRate, true);
  view.setUint32(12, channelCount, true);
  view.setUint32(16, frames, true);
  const out = new Float32Array(ab, HEADER_BYTES);
  for (let c = 0; c < channelCount; c++) out.set(sample.channels[c], c * frames);
  return ab;
}

function unpackPcm(ab: ArrayBuffer): { channels: Float32Array[]; sampleRate: number } | null {
  if (ab.byteLength < HEADER_BYTES) return null;
  const view = new DataView(ab);
  if (view.getUint32(0, true) !== MAGIC) return null;
  const sampleRate = view.getFloat64(4, true);
  const channelCount = view.getUint32(12, true);
  const frames = view.getUint32(16, true);
  const flat = new Float32Array(ab, HEADER_BYTES, channelCount * frames);
  const channels: Float32Array[] = [];
  // Copy each channel out so views don't alias the fetched buffer (which may be GC'd/reused).
  for (let c = 0; c < channelCount; c++) channels.push(flat.slice(c * frames, (c + 1) * frames));
  return { channels, sampleRate };
}

/** Store one sample's PCM: hash → OPFS (dedupe) → durable per-user locker copy. */
async function putSamplePcm(sample: KeraSample): Promise<{ key: string; lockerUrl?: string }> {
  const ab = packPcm(sample);
  const hash = await sha256Hex(ab);
  const key = keyFor(hash);
  if (!(await hasBytes(key))) await putBytes(key, new Blob([ab], { type: 'application/octet-stream' }));
  let lockerUrl: string | undefined;
  const user = auth.currentUser;
  if (user) {
    try {
      const safe = sample.name.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'sample';
      lockerUrl = await uploadFile(`personal/${user.uid}/melos/beats/kera/${hash}_${safe}`, new Blob([ab]));
    } catch { /* best-effort: OPFS still has it, and a later save retries */ }
  }
  return { key, lockerUrl };
}

async function getSamplePcm(s: SerializedKeraSample): Promise<{ channels: Float32Array[]; sampleRate: number } | null> {
  try {
    let blob = await getBytes(s.key);
    if (!blob && s.lockerUrl) {
      const res = await fetch(s.lockerUrl);
      if (res.ok) { blob = await res.blob(); void putBytes(s.key, blob); } // re-seed OPFS
    }
    if (!blob) return null;
    return unpackPcm(await blob.arrayBuffer());
  } catch (e) {
    console.warn('[kera] sample hydrate failed', s.name, e);
    return null;
  }
}

/**
 * Serialize a live program for the doc: every sample's PCM is stored to the owner's OPFS + locker,
 * deduped by content hash, and the returned object (metadata + refs, no PCM) is what gets written
 * into TrackInstrument.kera. Safe to run after the sound is already playing — it only persists.
 */
export async function serializeKeraProgram(program: KeraProgram, prior?: SerializedKeraProgram | null): Promise<SerializedKeraProgram> {
  // Editing zones/loops/amp doesn't change PCM, so reuse a prior store-ref when the audio is
  // provably identical (same id, frame count, rate, channels) instead of re-hashing megabytes on
  // every drag. Fresh PCM (a newly loaded sample) has no match and is stored.
  const priorById = new Map((prior?.samples ?? []).map((s) => [s.id, s]));
  const samples: SerializedKeraSample[] = [];
  for (const s of program.samples) {
    const frames = s.channels[0]?.length ?? 0;
    const p = priorById.get(s.id);
    const reusable = p && p.frames === frames && p.sampleRate === s.sampleRate && p.channelCount === s.channels.length;
    const { key, lockerUrl } = reusable ? { key: p.key, lockerUrl: p.lockerUrl } : await putSamplePcm(s);
    samples.push({
      id: s.id, name: s.name, sampleRate: s.sampleRate,
      frames, channelCount: s.channels.length,
      rootNote: s.rootNote, fineTune: s.fineTune,
      loopStart: s.loopStart, loopEnd: s.loopEnd, loopMode: s.loopMode,
      key, lockerUrl,
    });
  }
  return {
    v: 1, name: program.name, source: program.source, zones: program.zones, amp: program.amp,
    playMode: program.playMode, transpose: program.transpose, gainDb: program.gainDb,
    polyphony: program.polyphony, samples,
  };
}

/**
 * A metadata-only program for UI display (zone map, counts, name) without fetching any PCM — so a
 * saved KERA track's panel can show what's loaded instantly on open, while the audible program
 * hydrates in the engine separately. The samples carry empty channel arrays.
 */
export function keraProgramShell(sp: SerializedKeraProgram): KeraProgram {
  const prog = emptyProgram(sp.name);
  prog.source = sp.source;
  prog.zones = sp.zones;
  prog.amp = sp.amp;
  prog.playMode = sp.playMode;
  prog.transpose = sp.transpose;
  prog.gainDb = sp.gainDb;
  prog.polyphony = sp.polyphony;
  prog.samples = sp.samples.map((s) => ({
    id: s.id, name: s.name, channels: [], sampleRate: s.sampleRate,
    rootNote: s.rootNote, fineTune: s.fineTune,
    loopStart: s.loopStart, loopEnd: s.loopEnd, loopMode: s.loopMode,
  }));
  return prog;
}

/**
 * Rebuild a playable program from the doc. Returns null only if NOTHING could be hydrated (all PCM
 * evicted and no locker) — a partial hydrate (some samples missing) still returns a program so the
 * zones that survive still play.
 */
export async function deserializeKeraProgram(sp: SerializedKeraProgram): Promise<KeraProgram | null> {
  if (!sp?.samples) return null;
  const prog = emptyProgram(sp.name);
  prog.source = sp.source;
  prog.zones = sp.zones;
  prog.amp = sp.amp;
  prog.playMode = sp.playMode;
  prog.transpose = sp.transpose;
  prog.gainDb = sp.gainDb;
  prog.polyphony = sp.polyphony;

  const out: KeraSample[] = [];
  for (const s of sp.samples) {
    const pcm = await getSamplePcm(s);
    if (!pcm) continue; // dropped sample: its zones simply won't sound, rather than failing the load
    out.push({
      id: s.id, name: s.name, channels: pcm.channels, sampleRate: pcm.sampleRate,
      rootNote: s.rootNote, fineTune: s.fineTune,
      loopStart: s.loopStart, loopEnd: s.loopEnd, loopMode: s.loopMode,
    });
  }
  prog.samples = out;
  return out.length ? prog : null;
}
